import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Synthetic sessions only. These checks do not contact a deployed Auth service.
const session = { access_token: 'fixture-access', refresh_token: 'fixture-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'fixture-user', email: 'omit' } };
function server({ fail = false, env = true } = {}) {
  const calls = [];
  const source = readFileSync(new URL('../api/auth.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default async function', 'async function');
  const reply = async (...args) => {
    calls.push(args);
    return fail ? { error: { status: 400, message: 'must never escape' } } : { data: { session }, error: null };
  };
  const handler = vm.runInNewContext(source + '; handler', {
    process: { env: env ? { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-server' } : {} },
    createClient: (_url, _key, options) => {
      assert.equal(options.auth.persistSession, false);
      return { auth: { signInWithPassword: reply, refreshSession: reply, admin: { signOut: reply } } };
    },
  });
  return { calls, async request(body, headers = {}, method = 'POST') {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; }, json(data) { this.body = JSON.parse(JSON.stringify(data)); return this; } };
    await handler({ method, body, headers: { 'content-type': 'application/json', ...headers } }, res);
    return res;
  } };
}
test('server login/refresh return only user session; logout revokes local session', async () => {
  const api = server();
  for (const body of [{ action: 'login', email: 'fixture', password: 'fixture' },
    { action: 'refresh', refresh_token: 'fixture-refresh' }]) {
    const res = await api.request(body);
    assert.equal(res.code, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(res.body.session.user, { id: session.user.id });
    assert.equal(JSON.stringify(res.body).includes('fixture-server'), false);
  }
  const res = await api.request({ action: 'logout' }, { authorization: 'Bearer fixture-access' });
  assert.equal(res.code, 200);
  assert.equal(res.body.session, null);
  assert.deepEqual(api.calls.at(-1), ['fixture-access', 'local']);
});
test('server rejects invalid input, unsupported methods, missing config and failed login', async () => {
  const api = server();
  assert.equal((await api.request({}, {}, 'GET')).code, 405);
  assert.equal((await api.request({}, { 'content-type': 'text/plain' })).code, 415);
  for (const body of ['{', {}, { action: 'logout' }, { action: 'login', email: 'fixture' }]) {
    assert.equal((await api.request(body)).code, 400);
  }
  assert.equal(api.calls.length, 0);
  const body = { action: 'login', email: 'fixture', password: 'fixture' };
  assert.equal((await server({ env: false }).request(body)).code, 500);
  const denied = await server({ fail: true }).request(body);
  assert.equal(denied.code, 401);
  assert.equal(JSON.stringify(denied.body).includes('must never escape'), false);
});

test('browser keeps tokens only in memory, refreshes and clears on logout', async () => {
  const storage = new Map([['vault-session-v1', 'legacy-token-must-not-be-read']]);
  let refreshTimer;
  const requests = [];
  const events = [];
  let focused;
  const source = readFileSync(new URL('../public/auth-client.js', import.meta.url), 'utf8')
    .replace('export function', 'function');
  const create = vm.runInNewContext(source + '; createAuthClient', {
    localStorage: { getItem() { assert.fail('must not read persisted tokens'); }, setItem() { assert.fail('must not persist tokens'); }, removeItem: k => storage.delete(k) },
    navigator: {}, window: { addEventListener: (name, fn) => { if (name === 'focus') focused = fn; } },
    setTimeout: fn => { refreshTimer = fn; return 1; }, clearTimeout() {}, AbortSignal,
    fetch: async (url, options) => {
      assert.equal(url, '/api/auth');
      const body = JSON.parse(options.body);
      requests.push(body.action);
      return { ok: true, json: async () => ({ session: body.action === 'logout' ? null : session }) };
    },
  });
  const client = create();
  client.auth.onAuthStateChange((_event, value) => events.push(value));
  const login = await client.auth.signInWithPassword({ email: 'fixture', password: 'fixture' });
  assert.equal(login.error, null);
  assert.equal(events[0], null);
  assert.equal(events.at(-1).user.id, session.user.id);
  const expiry = session.expires_at;
  session.expires_at = 0;
  focused();
  // Logout queues behind restore/refresh, so a late refresh cannot restore a logged-out session.
  assert.equal((await client.auth.signOut()).error, null);
  session.expires_at = expiry;
  assert.deepEqual(requests, ['login', 'refresh', 'logout']);
  const freshEvents = [];
  create().auth.onAuthStateChange((_event, value) => freshEvents.push(value));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(freshEvents.at(-1), null);
  assert.equal(storage.size, 0);
  assert.equal(events.at(-1), null);
});

test('public browser sources contain no project keys or Supabase SDK import', () => {
  for (const path of ['../public/index.html', '../public/auth-client.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /sb_publishable_|sb_secret_|eyJ[A-Za-z0-9_-]+\.eyJ|@supabase\/supabase-js|supabase\.co/);
  }
});
