import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { decide } from '../xdr/web-injection/decide.mjs';

test('가상 경보의 명확한 반복 공격·애매한 시도·일반 활동 구분', async () => {
  const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/web-injection.json', import.meta.url), 'utf8'));
  // 공개 경보의 설명·수준을 검토해 정한 로컬 기대값이며 비공개 심판 정답표가 아닙니다.
  for (const [index, alert] of fixture.alerts.entries()) {
    const expected = index < 8 ? 'block' : index < 17 ? 'alert' : 'record';
    const result = decide(alert);
    assert.equal(result.action, expected, alert.id);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.ok(!/[\r\n]/.test(result.reason));
    // 경보 번호를 변경해도 결과가 같아야 합니다.
    assert.deepEqual(decide({ ...alert, id: 'unseen-id' }), result);
  }
});

test('중간 수준만으로 알림을 만들지 않고 약한 신호만으로 차단하지 않는다', () => {
  const alert = (level, description, count = '1') => ({ rule: { level, description }, data: { count, srcip: '192.0.2.1' } });
  assert.equal(decide(alert(6, '자료 목록을 조회했습니다.')).action, 'record');
  assert.equal(decide(alert(3, 'select 수업명 조회')).action, 'record');
  assert.equal(decide(alert(6, 'select 수업명 조회', '100')).action, 'alert');
  assert.equal(decide(alert(7, '요청 주소가 평소보다 깁니다.')).action, 'alert');
  assert.equal(decide(alert(12, '명령 구분자 표기가 연속 요청 11번에 있습니다.', '11')).action, 'block');
  assert.equal(decide(null).action, 'record');
});

test('외부 의존성 없이 단독 계산하고 패턴 원본과 일치한다', async () => {
  const source = await readFile(new URL('../xdr/web-injection/decide.mjs', import.meta.url), 'utf8');
  assert.ok(!/\b(?:import|require|fetch|process)\b/.test(source));
  const context = vm.createContext({});
  vm.runInContext(source.replace('export function decide', 'function decide'), context, { timeout: 1000 });
  assert.equal(vm.runInContext('decide(null).action', context, { timeout: 100 }), 'record');
  const patterns = JSON.parse(await readFile(new URL('../xdr/web-injection/patterns.json', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(PATTERNS)', context)), patterns.patterns);
});
