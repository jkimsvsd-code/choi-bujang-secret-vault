import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('경보 설명 기준 분류와 독립 실행을 확인한다 (운영·심판 검증 아님)', async () => {
  const source = await readFile(new URL('../xdr/privilege/decide.mjs', import.meta.url), 'utf8');
  assert.ok(!/\b(?:import|require|fetch|process)\b/.test(source));
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.deepEqual(Object.keys(module), ['decide']);
  const patterns = JSON.parse(await readFile(new URL('../xdr/privilege/patterns.json', import.meta.url), 'utf8')).patterns;
  assert.deepEqual(JSON.parse(source.match(/^const PATTERNS = ([\s\S]*?);\s*\/\//)[1]), patterns);
  const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/privilege.json', import.meta.url), 'utf8'));
  // 공개 정답이 아닌 수업용 설명 검토에 따른 기대값입니다.
  for (const [index, alert] of fixture.alerts.entries()) {
    const before = JSON.stringify(alert);
    const result = module.decide(alert);
    assert.equal(result.action, index < 9 ? 'block' : index < 17 ? 'alert' : 'record', alert.id);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.equal(result.action, result.confidence >= .85 ? 'block' : result.confidence >= .5 ? 'alert' : 'record');
    assert.ok(!/[\r\n]/.test(result.reason));
    assert.deepEqual(module.decide({ ...alert, id: 'unrelated', rule: { ...alert.rule, level: 0, mitre: [] } }), result);
    assert.equal(JSON.stringify(alert), before);
  }
  for (const [description, action, group] of [
    ['관리자 그룹에 추가되지 않았습니다.', 'record'],
    ['관리자 그룹에 추가됐습니다.', 'alert'],
    ['원격 주소에서 관리자 그룹에 추가됐습니다.', 'alert', 'project-week3'],
    ['처음 보는 관리자 명령을 실행했습니다.', 'alert'],
    ['그룹 목록을 읽기만 했습니다.', 'record'],
    ['자기 세션 정보를 조회했습니다.', 'record'],
    ['방금 관리자가 된 계정이 관리자 명령을 실행하지 않았습니다.', 'alert'],
  ]) {
    assert.equal(module.decide({ rule: { description }, data: { group } }).action, action);
  }
  assert.equal(module.decide(null).action, 'record');
});
