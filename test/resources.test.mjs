import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Local mock requests only; no deployment, DB or judge is contacted.
function load(name, denials = []) {
  const source = readFileSync(new URL(`../api/${name}.js`, import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export default async function handler', 'async function handler');
  return vm.runInNewContext(source + '; handler', {
    // Existing resource tests run behind an already-verified device boundary.
    requireDeviceApproval: async () => true,
    config: {}, console: { warn: message => denials.push(message) },
    process: { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } },
    createLoginVerifier: () => async auth => auth === 'Bearer fixture-valid'
      ? { userId: '11111111-1111-4111-8111-111111111111' } : null,
    createClient: () => ({ from(name) {
      assert.equal(name, 'learning_notices');
      return { select() { return this; }, eq(key, value) {
        assert.equal(key, 'published'); assert.equal(value, true); return this;
      }, async order() { return { data: [], error: null }; } };
    } }),
  });
}
async function request(handler, overrides = {}) {
  const req = { method: 'GET', resourceId: 'forged',
    headers: { 'x-resource-id': 'forged' }, query: { resourceId: 'forged' },
    body: { resourceId: 'forged' }, ...overrides };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
  await handler(req, res);
  return { req, res };
}

test('server resource identity survives spoofing and rejected collection/item requests', async () => {
  for (const name of ['notes', 'notices']) {
    const handler = load(name);
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      for (const noteItemRoute of [false, true]) {
        const { req, res } = await request(handler, { method, noteItemRoute });
        assert.equal(req.resourceId, name);
        assert.equal(res.headers['X-Resource-Id'], name);
        assert.ok([401, 405].includes(res.code));
      }
    }
  }
});

test('notices require verified login and return a separate empty collection', async () => {
  const handler = load('notices');
  const good = await request(handler, { headers: { authorization: 'Bearer fixture-valid' } });
  assert.equal(good.res.code, 200);
  assert.deepEqual(good.res.body, []);
  assert.equal(good.res.headers['X-Resource-Id'], 'notices');
  const bad = await request(handler, { headers: { authorization: 'Bearer fixture-invalid' } });
  assert.equal(bad.res.code, 401);
  assert.equal(bad.res.body.error, 'Authentication failed');
});

test('direct notice writes with forged instructor authority are denied without leaking request data', async () => {
  const denials = [];
  const handler = load('notices', denials);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const { res } = await request(handler, { method,
      headers: { authorization: 'Bearer fixture-valid', 'x-role': 'instructor' },
      query: { role: 'instructor' }, body: { role: 'instructor', body: 'private fixture' } });
    assert.equal(res.code, 405);
    assert.equal(res.headers['X-Denial-Reason'], 'notices_read_only');
    assert.deepEqual(res.body, { error: 'Method not allowed' });
  }
  assert.deepEqual(denials, Array(4).fill('api_denied resource=notices reason=notices_read_only'));
});
