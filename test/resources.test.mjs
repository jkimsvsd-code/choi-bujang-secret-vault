import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Local mock requests only; no deployment, DB or judge is contacted.
function load(name) {
  const source = readFileSync(new URL(`../api/${name}.js`, import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export default async function handler', 'async function handler');
  return vm.runInNewContext(source + '; handler', {
    config: {},
    process: { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } },
    createLoginVerifier: () => async auth => auth === 'Bearer fixture-valid'
      ? { userId: '11111111-1111-4111-8111-111111111111' } : null,
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
