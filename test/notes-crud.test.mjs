import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capture, simulate, planRestore, restoreTrial } from '../scripts/policy-backup.mjs';

// In-memory API integration checks, not deployment or judge results.
const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const givenId = '33333333-3333-4333-8333-333333333333';
function fixture() {
  const rows = new Map();
  const denials = [];
  let dbCalls = 0;
  const table = () => {
    dbCalls++;
    let filters = [], operation = 'select', values;
    const query = {
      select() { return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      update(value) { operation = 'update'; values = value; return this; },
      delete() { operation = 'delete'; return this; },
      async insert(row) {
        if (rows.has(row.note_id)) return { error: { code: '23505' } };
        rows.set(row.note_id, { ...row }); return { error: null };
      },
      async order() { return { data: [...rows.values()].filter(match), error: null }; },
      async maybeSingle() {
        const row = [...rows.values()].find(match);
        if (!row) return { data: null, error: null };
        if (operation === 'update') Object.assign(row, values);
        if (operation === 'delete') rows.delete(row.note_id);
        return { data: { ...row }, error: null };
      },
    };
    function match(row) { return filters.every(([key, value]) => row[key] === value); }
    return query;
  };
  const source = readFileSync(new URL('../api/notes.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default async function handler', 'async function handler');
  const handler = vm.runInNewContext(source + '; handler', {
    // Existing resource tests run behind an already-verified device boundary.
    requireDeviceApproval: async () => true,
    randomUUID, config: {}, console: { warn: message => denials.push(message) },
    process: { env: { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } },
    createLoginVerifier: () => async value => value === 'Bearer fixture-a' ? { userId: userA }
      : value === 'Bearer fixture-b' ? { userId: userB } : null,
    createClient: () => ({ from: table }),
  });
  async function request(method, { id, body, auth = 'Bearer fixture-a', query = {} } = {}) {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; }, json(value) { this.body = JSON.parse(JSON.stringify(value)); return this; }, end() { return this; } };
    await handler({ method, headers: { authorization: auth }, noteItemRoute: id !== undefined,
      query: { ...query, ...(id !== undefined ? { id } : {}) }, body }, res);
    return res;
  }
  return { request, rows, denials, dbCalls: () => dbCalls };
}

test('restored trial route keeps A read 200 and B access to A note 404 (mock API)', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'vault-restore-api-'));
  try {
    const directory = resolve(temporary, 'baseline');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const digest = await capture(root, directory, 'a'.repeat(40));
    await simulate(directory, digest);
    const plan = await planRestore(directory, digest);
    await restoreTrial(directory, digest, plan.confirmation);
    const restored = JSON.parse(await readFile(resolve(directory, 'trial.json')));
    const routes = JSON.parse(restored['aleph.config.json#allowedRoutes']);
    const { request, rows, denials } = fixture();
    rows.set(givenId, { note_id: givenId, owner_id: userA, sample_marker: 'SAMPLE_NOTE_1', title: 'fixture', content: 'fixture' });
    const original = { ...rows.get(givenId) };
    // Use restored route configuration as the gate, then the existing API owner check.
    async function throughTrial(auth) {
      if (!routes.includes('GET /api/notes/:id')) return { code: 403 };
      return request('GET', { id: givenId, auth });
    }
    assert.equal((await throughTrial('Bearer fixture-a')).code, 200);
    assert.equal((await throughTrial('Bearer fixture-b')).code, 404);
    assert.equal((await throughTrial('Bearer fixture-a')).code, 200);
    assert.deepEqual(rows.get(givenId), original);
    assert.equal(denials.length, 1);
    assert(routes.includes('GET /api/notices'));
    assert(!routes.includes('POST /api/notes/:id'));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('direct API calls cannot bypass stored owner or zone with an instructor role', async () => {
  const { request, rows, denials } = fixture();
  for (const [owner_id, sample_marker] of [[userB, 'SAMPLE_NOTE_1'], [userA, 'INSTRUCTOR_ONLY']]) {
    rows.set(givenId, { note_id: givenId, owner_id, sample_marker, title: 'private fixture', content: 'private fixture' });
    const original = { ...rows.get(givenId) };
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const result = await request(method, { id: givenId,
        query: { role: 'instructor', owner_id, resourceId: 'notes' },
        body: { role: 'instructor', owner_id: userA, sample_marker: 'SAMPLE_NOTE_1', title: 'changed', body: 'changed' } });
      assert.equal(result.code, 404);
      assert.equal(result.headers['X-Denial-Reason'], 'note_unavailable');
      assert.deepEqual(result.body, { error: 'Note not found' });
      assert.deepEqual(rows.get(givenId), original);
    }
    assert.deepEqual((await request('GET', { query: { role: 'instructor' } })).body, []);
  }
  assert.deepEqual(denials, Array(6).fill('api_denied resource=notes reason=note_unavailable'));
});

test('A CRUD, generated UUID, owner binding, list isolation and deleted GET 404', async () => {
  const { request, rows } = fixture();
  const created = await request('POST', { body: { title: 'fixture', body: 'fixture', owner_id: userB, userId: userB, role: 'admin' } });
  assert.equal(created.code, 201);
  assert.match(created.body.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(created.body), ['id']);
  const id = created.body.id;
  assert.equal(rows.get(id).owner_id, userA);
  rows.set(givenId, { note_id: givenId, owner_id: userB, sample_marker: 'SAMPLE_NOTE_1', title: 'fixture', content: 'fixture' });
  const list = await request('GET', { query: { owner_id: userB } });
  assert.equal(list.code, 200);
  assert.deepEqual(list.body, [{ id, title: 'fixture', body: 'fixture' }]);
  assert.deepEqual((await request('GET', { id })).body, list.body[0]);
  const updated = await request('PUT', { id, body: { title: 'changed', body: 'changed', owner_id: userB } });
  assert.equal(updated.code, 200);
  assert.equal(updated.body.body, 'changed');
  assert.equal(rows.get(id).owner_id, userA);
  assert.equal((await request('DELETE', { id })).code, 204);
  assert.equal((await request('GET', { id })).code, 404);
  assert.equal((await request('PUT', { id, body: { title: 'x', body: 'x' } })).code, 404);
  assert.equal((await request('DELETE', { id })).code, 404);
});

test('A and B cannot read, overwrite, transfer or delete each other\'s notes', async () => {
  const { request, rows } = fixture();
  for (const [auth, owner, other] of [
    ['Bearer fixture-a', userA, userB], ['Bearer fixture-b', userB, userA],
  ]) {
    const created = await request('POST', {
      auth, query: { owner_id: other },
      body: { title: 'own', body: 'own', owner_id: other },
    });
    assert.equal(created.code, 201);
    const id = created.body.id;
    assert.equal(rows.get(id).owner_id, owner);
    const foreignAuth = owner === userA ? 'Bearer fixture-b' : 'Bearer fixture-a';
    const original = { ...rows.get(id) };
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const denied = await request(method, {
        id, auth: foreignAuth, query: { owner_id: owner, userId: owner },
        body: { title: 'stolen', body: 'stolen', owner_id: other, role: 'admin' },
      });
      assert.equal(denied.code, 404);
      assert.deepEqual(denied.body, { error: 'Note not found' });
      assert.deepEqual(rows.get(id), original);
    }
    const updated = await request('PUT', {
      id, auth, query: { owner_id: other },
      body: { title: 'updated', body: 'updated', owner_id: other },
    });
    assert.equal(updated.code, 200);
    assert.deepEqual(updated.body, { id, title: 'updated', body: 'updated' });
    assert.equal(rows.get(id).owner_id, owner);
    assert.deepEqual((await request('GET', { id, auth })).body, updated.body);
    const list = await request('GET', { auth, query: { owner_id: other } });
    assert.equal(list.code, 200);
    assert(list.body.every(note => rows.get(note.id).owner_id === owner));
    assert.equal((await request('DELETE', { id, auth })).code, 204);
    assert.equal(rows.has(id), false);
  }
});

test('all supported operations reject missing or invalid authentication before DB', async () => {
  const { request, dbCalls } = fixture();
  for (const auth of ['', 'Bearer rejected']) {
    for (const [method, id] of [['GET'], ['POST'], ['GET', givenId], ['PUT', givenId], ['DELETE', givenId]]) {
      const result = await request(method, { id, auth, body: { title: 'fixture', body: 'fixture', userId: userA, role: 'admin' } });
      assert.equal(result.code, 401); assert(!result.body.notes);
    }
  }
  assert.equal(dbCalls(), 0);
});

test('provided UUID, conflicts, invalid IDs and payloads', async () => {
  const { request } = fixture();
  assert.equal((await request('POST', { body: { id: givenId, title: 'x', body: 'x' } })).code, 201);
  assert.equal((await request('POST', { body: { id: givenId, title: 'x', body: 'x' } })).code, 409);
  for (const body of ['{', [], { title: '', body: 'x' }, { title: 'x', body: 'x', id: 'bad' }])
    assert.equal((await request('POST', { body })).code, 400);
  assert.equal((await request('GET', { id: 'bad' })).code, 400);
  assert.equal((await request('PUT', { body: { title: 'x', body: 'x' } })).code, 405);
});
