import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

// Synthetic engine requests, not live access or judge results.
async function check(overrides, expected) {
  const request = { ...fixtureRequests().normal, ...overrides };
  const result = await decide(request);
  assert.equal(result.decision, expected, JSON.stringify(overrides));
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
  assert.equal(result.requestId, request.requestId);
  assert.ok(result.ruleIds.every(id => RULE_IDS.includes(id)));
}

test('exact service/path/route permits opaque note IDs and read-only notice collection', async () => {
  for (const prefix of ['', '/api']) {
    for (const id of ['demo', '123', 'memo-가', '11111111-1111-4111-8111-111111111111']) {
      await check({ path: `${prefix}/notes/${id}`, route: `GET ${prefix}/notes/:id` }, 'allow');
    }
    await check({ service: 'notices', path: `${prefix}/notices`, route: `GET ${prefix}/notices` }, 'allow');
    await check({ path: `${prefix}/notes`, route: `GET ${prefix}/notes` }, 'deny');
    for (const suffix of ['', 'demo/extra', 'demo/', 'export', 'EXPORT', '%65xport', '.', '..', '%2e%2e', '%2f', '%252f', 'demo?export=1', 'demo#export', 'demo\\export']) {
      await check({ path: `${prefix}/notes/${suffix}`, route: `GET ${prefix}/notes/:id` }, 'deny');
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
      await check({ service: 'notices', method, path: `${prefix}/notices`, route: `${method} ${prefix}/notices` }, 'deny');
      await check({ method, path: `${prefix}/notes/demo`, route: `${method} ${prefix}/notes/:id` }, 'deny');
    }
  }
});

test('unknown zones, mismatches and query-selected operations fail closed even after step-up', async () => {
  const blocked = [
    { service: 'instructor', path: '/api/instructor/materials', route: 'GET /api/instructor/materials' },
    { service: 'materials', path: '/materials/demo', route: 'GET /materials/:id' },
    { service: 'unknown' }, { service: 'notices' },
    { path: '/api/admin/notices', route: 'GET /api/admin/notices' },
    { path: '/notes/demo', route: 'GET /api/notes/:id' },
    { path: '/other/demo' }, { route: undefined }, { path: undefined },
    { queryLength: 1 }, { queryLength: undefined },
    { service: 'notices', path: '/notices/demo', route: 'GET /notices/:id' },
  ];
  for (const entry of blocked) {
    await check({ ...entry, stepUp: { verified: true, authAgeSeconds: 0 } }, 'deny');
  }
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    await check({ service: 'instructor', method, path: '/instructor/demo', route: `${method} /instructor/:id` }, 'deny');
  }
});

test('device and input guards also apply to notices; configured routes match allowed API routes', async () => {
  const notices = { service: 'notices', path: '/api/notices', route: 'GET /api/notices' };
  await check({ ...notices, deviceRegistered: false }, 'deny');
  await check({ ...notices, signals: undefined }, 'deny');
  const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.allowedRoutes, ['GET /api/notes/:id', 'GET /api/notices']);
  for (const route of config.allowedRoutes) {
    await check({ service: route.includes('/notes/') ? 'notes' : 'notices', route,
      path: route.slice(4).replace(':id', 'demo') }, 'allow');
  }
});
