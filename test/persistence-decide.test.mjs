import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

 test('독립 모듈에서 공격·애매·정상을 구분하고 ID·수준에 의존하지 않는다', async () => {
  const source = await readFile(new URL('../xdr/persistence/decide.mjs', import.meta.url), 'utf8');
  assert.ok(!/\b(?:import|require|fetch|process)\b/.test(source));
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.deepEqual(Object.keys(module), ['decide']);
  const patterns = JSON.parse(await readFile(new URL('../xdr/persistence/patterns.json', import.meta.url), 'utf8')).patterns;
  assert.deepEqual(JSON.parse(source.slice(source.indexOf('['), source.indexOf(';\n'))), patterns);
  const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/persistence.json', import.meta.url), 'utf8'));
  // 원본 설명을 검토한 수업용 기대값. 심판 정답이나 운영 판정이 아니다.
  for (const [index, alert] of fixture.alerts.entries()) {
    const expected = index < 8 ? 'block' : index < 16 ? 'alert' : 'record';
    const original = JSON.stringify(alert);
    const result = module.decide(alert);
    assert.equal(result.action, expected, alert.id);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.equal(result.action, result.confidence >= .85 ? 'block' : result.confidence >= .5 ? 'alert' : 'record');
    assert.ok(!/[\r\n]/.test(result.reason));
    assert.equal(JSON.stringify(alert), original);
    assert.deepEqual(module.decide({...alert, id:'changed', rule:{...alert.rule, level:0, mitre:[]}}), result);
  }
  assert.equal(module.decide(null).action,'record');
  assert.equal(module.decide({rule:{description:'서명 없는 새 서비스 등록은 없습니다.'}}).action,'record');
  assert.equal(module.decide({rule:{description:'처음 보는 예약 작업'}}).action,'alert');
});
