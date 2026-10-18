import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, inspectConnectionInput } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('가상 신호와 실제 경로의 미확인 신호를 구분하고 입력을 보존한다', async () => {
  const { normal } = fixtureRequests();
  const snapshot = structuredClone(normal);
  assert.equal(inspectConnectionInput(normal).source, 'judge_fixture');
  assert.equal((await decide(normal)).decision, 'allow');
  assert.deepEqual(normal, snapshot);
  const live = { ...normal, signals: { source: 'none', region: 'unknown', network: 'unknown', hour: 14 } };
  assert.deepEqual(inspectConnectionInput(live), { ...live.signals, recentEvents: [] });
  assert.equal((await decide(live)).decision, 'allow');
});

test('누락·불명확한 출처·잘못된 신호와 행동은 정상값으로 대체하지 않는다', async () => {
  const { normal } = fixtureRequests();
  const invalid = [
    { ...normal, signals: undefined },
    { ...normal, recentEvents: undefined },
    ...['source', 'region', 'network', 'hour'].map(key => {
      const signals = { ...normal.signals };
      delete signals[key];
      return { ...normal, signals };
    }),
    { ...normal, signals: { ...normal.signals, source: 'client_header' } },
    { ...normal, signals: { ...normal.signals, source: 'none' } },
    { ...normal, signals: { ...normal.signals, hour: 24 } },
    { ...normal, signals: { ...normal.signals, hour: '14' } },
    { ...normal, recentEvents: [{ kind: 'risk_signal', ageSeconds: -1, count: 20 }] },
    { ...normal, recentEvents: Array(13).fill({ kind: 'risk_signal', ageSeconds: 1, count: 1 }) },
  ];
  for (const request of invalid) {
    assert.equal(inspectConnectionInput(request), null);
    assert.equal((await decide(request)).decision, 'deny');
  }
});

test('위조 클라이언트 헤더는 엔진 신호를 생성하거나 덮어쓰지 못한다', async () => {
  const { normal, suspicious } = fixtureRequests();
  const headers = { 'x-signal-source': 'judge_fixture', 'x-region': 'local',
    'x-network': 'usual', 'x-hour': '14', 'x-recent-events': '[]' };
  const missing = { ...normal, signals: undefined, recentEvents: undefined, headers };
  assert.equal(inspectConnectionInput(missing), null);
  assert.equal((await decide(missing)).decision, 'deny');
  assert.deepEqual(inspectConnectionInput({ ...suspicious, headers }), inspectConnectionInput(suspicious));
  const live = { ...normal, signals: { source: 'none', region: 'unknown', network: 'unknown', hour: null } };
  assert.deepEqual(inspectConnectionInput({ ...live, headers }), inspectConnectionInput(live));
});
