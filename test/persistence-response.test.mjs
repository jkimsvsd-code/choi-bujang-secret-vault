import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { respond } from '../xdr/persistence/respond.mjs';
import { matchesExternalDeny, requestFingerprint, alertFingerprint } from '../src/external-deny.mjs';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('신뢰 연결만 등록하고 동일 요청에만 만료 전 적용한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'persistence-'));
  try {
    const options = { output: join(directory, 'rules.json'), candidatesOutput: join(directory, 'candidates.json'),
      log: join(directory, 'alerts.log'), now: new Date() };
    const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/persistence.json', import.meta.url), 'utf8'));
    const first = await respond(options);
    assert.equal(first.rules, 0);
    assert.equal(first.candidates, 5);
    assert.equal(first.notifications, 13);
    const { normal, suspicious } = fixtureRequests();
    assert.equal((await decide(normal)).decision, 'allow');
    assert.equal((await decide(suspicious)).decision, 'step_up');
    assert.equal((await decide({ ...normal, deviceRegistered: false })).decision, 'deny');
    // 모의 엔진 감사 대조: 실제 운영 연결 증거가 아닙니다.
    const bindings = { schema: 'aleph.xdr.trusted-bindings.v1', bindings: [{
      evidenceAlertId: fixture.alerts[0].id, alertFingerprint: alertFingerprint(fixture.alerts[0]),
      requestFingerprint: requestFingerprint(normal), verifiedAt: options.now.toISOString(),
      expiresAt: new Date(options.now.getTime() + 60000).toISOString(),
    }] };
    // 정상 경보와 애매한 경보는 연결 자료가 있어도 거부 규칙이 되면 안 됩니다.
    for (const index of [8, 16]) {
      bindings.bindings.push({ ...bindings.bindings[0],
        evidenceAlertId: fixture.alerts[index].id,
        alertFingerprint: alertFingerprint(fixture.alerts[index]),
        requestFingerprint: requestFingerprint({ ...normal, requestId: `safe-${index}` }) });
    }
    const path = join(directory, 'bindings.json');
    await writeFile(path, JSON.stringify(bindings));
    const second = await respond({ ...options, trustedBindings: path });
    assert.equal(second.rules, 1);
    assert.equal(second.candidates, 4);
    // 실제 연결된 판정기 코드를 임시 자료실에서 실행하여 사용자 규칙 파일을 건드리지 않습니다.
    await mkdir(join(directory, 'src'));
    await mkdir(join(directory, 'xdr/persistence'), { recursive: true });
    for (const name of ['decider.mjs', 'external-deny.mjs']) {
      await copyFile(new URL(`../src/${name}`, import.meta.url), join(directory, 'src', name));
    }
    await copyFile(options.output, join(directory, 'xdr/persistence/deny-rules.json'));
    const connected = await import(pathToFileURL(join(directory, 'src/decider.mjs')));
    const blocked = await connected.decide(normal);
    assert.equal(blocked.decision, 'deny');
    assert.deepEqual(blocked.ruleIds, ['external_deny']);
    assert.equal((await connected.decide({ ...normal, requestId: 'next-normal-request' })).decision, 'allow');
    for (const index of [8, 16]) {
      assert.equal((await connected.decide({ ...normal, requestId: `safe-${index}` })).decision, 'allow');
    }
    assert.equal((await connected.decide(suspicious)).decision, 'step_up');
    const lookup = { file: options.output, now: options.now.getTime() };
    assert.equal(await matchesExternalDeny(normal, lookup), true);
    assert.equal(await matchesExternalDeny({ ...normal, requestId: 'different-request' }, lookup), false);
    assert.equal(await matchesExternalDeny({ ...normal, subjectId: 'different-subject' }, lookup), false);
    assert.equal(await matchesExternalDeny(normal, { ...lookup, now: lookup.now + 60000 }), false);
    bindings.bindings[0].alertFingerprint = '0'.repeat(64);
    await writeFile(path, JSON.stringify(bindings));
    assert.equal((await respond({ ...options, trustedBindings: path })).rules, 0);
    const logs = (await readFile(options.log, 'utf8')).trim().split('\n');
    assert.equal(logs.length, 39);
    assert.ok(logs.every(line => JSON.parse(line).enforced === false));
    assert.ok(!logs.join('').includes(normal.subjectId));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
