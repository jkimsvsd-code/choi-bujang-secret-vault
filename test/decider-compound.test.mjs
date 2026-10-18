import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('정해진 복합 사건은 사유와 함께 추가 확인, 정상 사건은 허용', async () => {
  const { normal, suspicious } = fixtureRequests();
  assert.equal((await decide(normal)).decision, 'allow');
  assert.deepEqual(await decide(suspicious), {
    schema: 'aleph.decision.v1', requestId: suspicious.requestId,
    decision: 'step_up', reasonCode: 'step_up_required', ruleIds: ['step_up_required'],
  });
  assert.equal((await decide({ ...suspicious,
    stepUp: { verified: true, authAgeSeconds: 60 } })).decision, 'allow');
});

test('재확인 나이 경계·누락·위조 및 모든 응답 계약을 검사한다', async () => {
  const { suspicious } = fixtureRequests();
  const cases = [
    [undefined, 'step_up'], [null, 'step_up'], [{ verified: true }, 'step_up'],
    [{ verified: false, authAgeSeconds: 0 }, 'step_up'],
    [{ verified: 'true', authAgeSeconds: 60 }, 'step_up'],
    ...[null, '60', -1, 301, 900, Infinity, NaN].map(authAgeSeconds => [{ verified: true, authAgeSeconds }, 'step_up']),
    ...[0, 60, 300].map(authAgeSeconds => [{ verified: true, authAgeSeconds }, 'allow']),
  ];
  for (const [stepUp, expected] of cases) {
    const response = await decide({ ...suspicious, stepUp,
      headers: { 'x-step-up-verified': 'true', 'x-auth-age-seconds': '0' } });
    assert.equal(response.decision, expected);
    assert.equal(response.schema, 'aleph.decision.v1');
    assert.equal(response.requestId, suspicious.requestId);
    assert.deepEqual(Object.keys(response).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
    assert.ok(response.ruleIds.every(id => RULE_IDS.includes(id)));
  }
  assert.equal((await decide({ ...suspicious, deviceRegistered: false,
    stepUp: { verified: true, authAgeSeconds: 0 } })).decision, 'deny');
});

test('지역만으로 차단하지 않으며 세 조건이 모두 있어야 한다', async () => {
  const { normal, suspicious } = fixtureRequests();
  assert.equal((await decide({ ...normal,
    signals: { ...normal.signals, region: 'foreign' } })).decision, 'allow');
  for (const region of ['local', 'foreign', 'unknown']) {
    assert.equal((await decide({ ...suspicious,
      signals: { ...suspicious.signals, region } })).decision, 'step_up');
  }
  for (const request of [
    { ...suspicious, signals: { ...suspicious.signals, hour: 6 } },
    { ...suspicious, signals: { ...suspicious.signals, network: 'usual' } },
    { ...suspicious, recentEvents: [] },
    { ...suspicious, recentEvents: [{ kind: 'risk_signal', ageSeconds: 61, count: 20 }] },
    { ...suspicious, recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 19 }] },
    { ...suspicious, recentEvents: [{ kind: 'other', ageSeconds: 60, count: 20 }] },
  ]) assert.equal((await decide(request)).decision, 'allow');
});

test('미등록 기기 거부와 입력 검사 및 경로 기본 거부를 유지한다', async () => {
  const { suspicious } = fixtureRequests();
  const unregistered = await decide({ ...suspicious, deviceRegistered: false });
  assert.equal(unregistered.decision, 'deny');
  assert.equal(unregistered.reasonCode, 'device_not_registered');
  assert.equal((await decide({ ...suspicious, signals: undefined })).decision, 'deny');
  assert.equal((await decide({ ...suspicious, method: 'POST' })).decision, 'deny');
  assert.equal((await decide({ ...suspicious, headers: {
    'x-hour': '14', 'x-network': 'usual', 'x-recent-events': '[]',
  } })).decision, 'step_up');
});
