import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { decide } from '../xdr/exfiltration/decide.mjs';

test('수업 경보 설명 기준 공격·애매·정상 분류와 독립 실행', async () => {
  const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/exfiltration.json', import.meta.url)));
  const source = await readFile(new URL('../xdr/exfiltration/decide.mjs', import.meta.url), 'utf8');
  const patterns = JSON.parse(await readFile(new URL('../xdr/exfiltration/patterns.json', import.meta.url)));
  assert.doesNotMatch(source, /\bimport\b|\brequire\s*\(/);
  const context = vm.createContext({});
  vm.runInContext(source.replace('export function decide', 'function decide'), context, { timeout: 1000 });
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(PATTERNS)', context)), patterns.patterns);
  // 교사 정답이 아닌 공개 설명을 읽어 정한 로컬 회귀 기대값입니다.
  for (const [index, alert] of fixture.alerts.entries()) {
    context.input = { ...alert, id: 'unrelated-id', rule: { ...alert.rule, level: 0 } };
    const output = vm.runInContext('decide(input)', context, { timeout: 1000 });
    assert.equal(output.action, index < 10 ? 'block' : index < 20 ? 'alert' : 'record', alert.id);
    assert.ok(output.confidence >= 0 && output.confidence <= 1);
    assert.equal(output.action, output.confidence >= 0.85 ? 'block' : output.confidence >= 0.5 ? 'alert' : 'record');
    assert.doesNotMatch(output.reason, /[\r\n]/);
  }
});

test('실패·일부 전송과 승인된 정상 전송을 차단하지 않는다', () => {
  for (const description of [
    '처음 보는 목적지로 대용량 반복 전송이 실패했습니다.',
    '업무 시간 밖 압축 파일 전송이 취소됐습니다.',
    '자료실 전체가 외부 주소로 일부만 전송됐습니다.',
  ]) assert.equal(decide({ rule: { description } }).action, 'alert');
  assert.equal(decide({ rule: { description: '승인된 백업으로 자료실 전체가 외부 주소로 복사됐습니다.' } }).action, 'record');
  for (const input of [null, {}, { rule: { description: 42 } }]) assert.equal(decide(input).action, 'record');
});
