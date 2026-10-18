import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const userId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
function fixture() {
  const state = { active: false, permissionError: false, kind: 'student', tables: [], logs: [],
    notice: { notice_id: resourceId, title: 'fixture', content: 'fixture', published: false },
    material: { material_id: resourceId, title: 'fixture', content: 'fixture' } };
  const source = readFileSync(new URL('../src/instructor-api.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');
  const handler = vm.runInNewContext(source + '; handleInstructorResource', {
    config: {}, console: { warn: line => state.logs.push(line) },
    process: { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } },
    createLoginVerifier: () => async auth => auth === 'Bearer fixture-valid' ? { userId, kind: state.kind } : null,
    createClient: () => ({ from(table) {
      state.tables.push(table);
      const filters = [];
      let update;
      return {
        select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
        update(value) { update = value; return this; },
        async maybeSingle() {
          if (table === 'vault_instructors') {
            assert.deepEqual(filters, [['user_id', userId], ['active', true]]);
            return state.permissionError ? { error: { message: 'must not escape' } }
              : { data: state.active ? { user_id: userId, active: true } : null };
          }
          assert.ok(['learning_notices', 'instructor_materials'].includes(table));
          const row = table === 'learning_notices' ? state.notice : state.material;
          if (!row || !filters.every(([key, value]) => row[key] === value)) return { data: null };
          if (update) {
            assert.deepEqual(Object.keys(update).sort(), ['content', 'title']);
            Object.assign(row, update);
          }
          return { data: row };
        },
      };
    } }),
  });
  async function request(operation, overrides = {}) {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
    await handler({ method: operation === 'edit_notice' ? 'PUT' : 'GET',
      headers: { authorization: 'Bearer fixture-valid', 'x-role': 'instructor' },
      query: { id: resourceId, role: 'instructor' },
      body: { title: 'changed', body: 'changed', role: 'instructor', published: true, active: true },
      ...overrides }, res, operation);
    return res;
  }
  return { state, request };
}

test('direct management/material requests require stored permission despite forged role', async () => {
  const { state, request } = fixture();
  for (const operation of ['edit_notice', 'read_material']) {
    const result = await request(operation);
    assert.equal(result.code, 403);
    assert.equal(result.headers['X-Denial-Reason'], 'instructor_required');
  }
  assert.deepEqual(state.tables, ['vault_instructors', 'vault_instructors']);
  assert.equal(state.notice.content, 'fixture');
  assert.ok(state.logs.every(line => /^api_denied resource=(notices|instructor_materials) reason=instructor_required$/.test(line)));
});

test('stored active instructor can edit notices and read materials; revocation is immediate on next request', async () => {
  const { state, request } = fixture();
  state.active = true;
  const updated = await request('edit_notice');
  assert.equal(updated.code, 200);
  assert.deepEqual(updated.body, { id: resourceId, title: 'changed', body: 'changed' });
  assert.equal(state.notice.published, false);
  assert.equal((await request('read_material')).code, 200);
  state.active = false;
  assert.equal((await request('read_material')).code, 403);
  assert.equal((await request('edit_notice')).code, 403);
});

test('missing/invalid login, wrong issuer, unavailable permission store and missing rows fail closed', async () => {
  const { state, request } = fixture();
  for (const authorization of ['', 'Bearer fixture-invalid']) {
    assert.equal((await request('read_material', { headers: { authorization } })).code, 401);
  }
  state.active = true;
  state.kind = 'judge';
  assert.equal((await request('read_material')).code, 403);
  assert.deepEqual(state.tables, []);
  state.kind = 'student'; state.permissionError = true;
  const denied = await request('edit_notice');
  assert.equal(denied.code, 503);
  assert.deepEqual(denied.body, { error: 'authorization_unavailable' });
  assert.deepEqual(state.tables, ['vault_instructors']);
  state.permissionError = false; state.material = null;
  assert.equal((await request('read_material')).code, 404);
  assert.equal((await request('read_material', { method: 'POST' })).code, 405);
  assert.equal((await request('edit_notice', { body: { title: '', body: 'x' } })).code, 400);
});

test('public notice reads return only published notice rows, never teacher materials or drafts', async () => {
  const source = readFileSync(new URL('../api/notices.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default async function', 'async function');
  let error = false;
  const rows = [
    { notice_id: resourceId, title: 'published', content: 'fixture', published: true },
    { notice_id: userId, title: 'draft', content: 'fixture', published: false },
  ];
  const handler = vm.runInNewContext(source + '; handler', {
    config: {}, console: { warn() {} },
    process: { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } },
    createLoginVerifier: () => async () => ({ userId, kind: 'student' }),
    createClient: () => ({ from(table) {
      assert.equal(table, 'learning_notices');
      let filter;
      return { select() { return this; }, eq(key, value) { filter = row => row[key] === value; return this; },
        async order() { return error ? { error: { message: 'must not escape' } } : { data: rows.filter(filter) }; } };
    } }),
  });
  const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; },
    json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } });
  const req = { method: 'GET', headers: { authorization: 'Bearer fixture-valid' },
    query: { published: false, role: 'instructor' } };
  const good = response(); await handler(req, good);
  assert.equal(good.code, 200);
  assert.deepEqual(good.body, [{ id: resourceId, title: 'published', body: 'fixture' }]);
  error = true;
  const bad = response(); await handler(req, bad);
  assert.equal(bad.code, 503);
  assert.deepEqual(bad.body, { error: 'Notices unavailable' });
});
