import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('정해진 복합 사건은 사유와 함께 추가 확인, 정상 사건은 허용', async () => {
  const { normal, suspicious } = fixtureRequests();
  assert.equal((await decide(normal)).decision, 'allow');
  assert.deepEqual(await decide(suspicious), {
    schema: 'aleph.decision.v1', requestId: suspicious.requestId,
    decision: 'step_up', reasonCode: 'step_up_required', ruleIds: ['compound_access_step_up'],
  });
  assert.equal((await decide({ ...suspicious,
    stepUp: { verified: true, authAgeSeconds: 60 } })).decision, 'step_up');
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
