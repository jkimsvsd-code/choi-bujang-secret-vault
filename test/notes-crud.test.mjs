import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

// In-memory API integration checks, not deployment or judge results.
const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const givenId = '33333333-3333-4333-8333-333333333333';
function fixture() {
  const rows = new Map();
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
    randomUUID, config: {},
    process: { env: { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } },
    createLoginVerifier: () => async value => value === 'Bearer fixture-a' ? { userId: userA } : null,
    createClient: () => ({ from: table }),
  });
  async function request(method, { id, body, auth = 'Bearer fixture-a', query = {} } = {}) {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; }, json(value) { this.body = JSON.parse(JSON.stringify(value)); return this; }, end() { return this; } };
    await handler({ method, headers: { authorization: auth }, noteItemRoute: id !== undefined,
      query: { ...query, ...(id !== undefined ? { id } : {}) }, body }, res);
    return res;
  }
  return { request, rows, dbCalls: () => dbCalls };
}

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
