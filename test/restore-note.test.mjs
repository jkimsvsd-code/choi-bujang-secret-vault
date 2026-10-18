import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const id = '92cd9cd2-589c-4e18-9e4c-3c9a2bd1aa69';
const owner = '22222222-2222-4222-8222-222222222222';
const contentHash = 'a'.repeat(64);
function fixture() {
  const calls = [];
  const state = { error: null, result: null };
  const source = readFileSync(new URL('../api/restore-note.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default async function', 'async function');
  const handler = vm.runInNewContext(source + '; handler', {
    // Existing resource tests run behind an already-verified device boundary.
    requireDeviceApproval: async () => true,
    config: {}, process: { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } },
    createLoginVerifier: () => async auth => auth === 'Bearer fixture-b' ? { userId: owner, kind: 'student' } : null,
    createClient: () => ({ async rpc(name, args) {
      calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
      return { error: state.error, data: state.result ?? { id, contentHash, ownerMatches: true,
        idMatches: true, hashMatches: true, restored: args.p_apply, content: 'never return', owner_id: owner } };
    } }),
  });
  async function request(body, { method = 'POST', auth = 'Bearer fixture-b' } = {}) {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; }, json(data) { this.data = JSON.parse(JSON.stringify(data)); return this; } };
    await handler({ method, headers: { authorization: auth }, body }, res);
    return res;
  }
  return { calls, state, request };
}

test('B fixture preview is read-only and restore sends verified identity and confirmation hash', async () => {
  const { request, calls } = fixture();
  const preview = await request({ id, mode: 'preview' });
  assert.equal(preview.code, 200);
  assert.equal(preview.data.restored, false);
  const result = await request({ id, mode: 'restore', contentHash: preview.data.contentHash });
  assert.equal(result.code, 200);
  assert.deepEqual(result.data, { id, contentHash, ownerMatches: true, idMatches: true, hashMatches: true, restored: true });
  assert.equal(result.headers['X-Resource-Id'], 'notes_restore');
  assert.deepEqual(calls, [false, true].map(p_apply => ({ name: 'restore_b_fixture_note',
    args: { p_caller: owner, p_id: id, p_apply, p_hash: p_apply ? contentHash : null } })));
});

test('missing auth, other target, forged owner/body and missing confirmation never reach DB', async () => {
  const { request, calls } = fixture();
  assert.equal((await request({ id, mode: 'preview' }, { auth: '' })).code, 401);
  assert.equal((await request({ id, mode: 'preview' }, { method: 'GET' })).code, 405);
  for (const input of [{ id: owner, mode: 'preview' }, { id, mode: 'restore' },
    { id, mode: 'preview', owner_id: owner }, { id, mode: 'restore', contentHash, body: 'injected' }]) {
    assert.equal((await request(input)).code, 400);
  }
  assert.equal(calls.length, 0);
});

test('DB rejection of snapshot/owner/hash is closed and raw errors are never exposed', async () => {
  const { request, state } = fixture();
  for (const [code, status] of [['42501', 403], ['P0001', 409], ['42P01', 503]]) {
    state.error = { code, message: 'private database details' };
    const result = await request({ id, mode: 'restore', contentHash });
    assert.equal(result.code, status);
    assert(!JSON.stringify(result.data).includes('private'));
  }
  state.error = null;
  state.result = { id, contentHash, ownerMatches: false, idMatches: true, hashMatches: true, restored: true };
  assert.equal((await request({ id, mode: 'restore', contentHash })).code, 503);
  state.result = { id, contentHash: 'b'.repeat(64), ownerMatches: true, idMatches: true, hashMatches: true, restored: true };
  assert.equal((await request({ id, mode: 'restore', contentHash })).code, 503);
});
