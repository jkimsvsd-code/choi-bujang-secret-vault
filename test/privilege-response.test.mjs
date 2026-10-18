import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { respond } from '../xdr/privilege/respond.mjs';
import { matchesExternalDeny, requestFingerprint, alertFingerprint } from '../src/external-deny.mjs';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { decide as classify } from '../xdr/privilege/decide.mjs';

test('모든 경보를 연결해도 block만 등록하고 중복·만료 연결은 제외한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'privilege-all-'));
  try {
    const now = new Date();
    const options = { now, output: join(directory, 'rules.json'),
      candidatesOutput: join(directory, 'candidates.json'), log: join(directory, 'alerts.log'),
      trustedBindings: join(directory, 'bindings.json') };
    const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/privilege.json', import.meta.url), 'utf8'));
    const { normal } = fixtureRequests();
    const bindings = fixture.alerts.map(alert => ({ evidenceAlertId: alert.id,
      alertFingerprint: alertFingerprint(alert),
      requestFingerprint: requestFingerprint({ ...normal, requestId: alert.id }),
      verifiedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60000).toISOString() }));
    const save = () => writeFile(options.trustedBindings,
      JSON.stringify({ schema: 'aleph.xdr.trusted-bindings.v1', bindings }));
    await save();
    assert.equal((await respond(options)).rules, 9);
    for (const alert of fixture.alerts) {
      assert.equal(await matchesExternalDeny({ ...normal, requestId: alert.id },
        { file: options.output, now: now.getTime() }), classify(alert).action === 'block', alert.id);
    }
    bindings.push({ ...bindings[0] });
    await save();
    assert.equal((await respond(options)).rules, 8);
    for (const binding of bindings) binding.expiresAt = now.toISOString();
    await save();
    assert.equal((await respond(options)).rules, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('신뢰 연결만 등록하고 동일 요청에만 만료 전 적용한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'privilege-'));
  try {
    const options = { output: join(directory, 'rules.json'), candidatesOutput: join(directory, 'candidates.json'),
      log: join(directory, 'alerts.log'), now: new Date() };
    const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/privilege.json', import.meta.url), 'utf8'));
    const first = await respond(options);
    assert.equal(first.rules, 0);
    assert.equal(first.candidates, 9);
    assert.equal(first.notifications, 17);
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
    for (const index of [9, 17]) {
      bindings.bindings.push({ ...bindings.bindings[0],
        evidenceAlertId: fixture.alerts[index].id,
        alertFingerprint: alertFingerprint(fixture.alerts[index]),
        requestFingerprint: requestFingerprint({ ...normal, requestId: `safe-${index}` }) });
    }
    const path = join(directory, 'bindings.json');
    await writeFile(path, JSON.stringify(bindings));
    const second = await respond({ ...options, trustedBindings: path });
    assert.equal(second.rules, 1);
    assert.equal(second.candidates, 8);
    // 실제 연결된 판정기 코드를 임시 자료실에서 실행하여 사용자 규칙 파일을 건드리지 않습니다.
    await mkdir(join(directory, 'src'));
    await mkdir(join(directory, 'xdr/privilege'), { recursive: true });
    for (const name of ['decider.mjs', 'external-deny.mjs']) {
      await copyFile(new URL(`../src/${name}`, import.meta.url), join(directory, 'src', name));
    }
    await copyFile(options.output, join(directory, 'xdr/privilege/deny-rules.json'));
    const connected = await import(pathToFileURL(join(directory, 'src/decider.mjs')));
    const blocked = await connected.decide(normal);
    assert.equal(blocked.decision, 'deny');
    assert.deepEqual(blocked.ruleIds, ['external_deny']);
    assert.equal((await connected.decide({ ...normal, requestId: 'next-normal-request' })).decision, 'allow');
    for (const index of [9, 17]) {
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
    assert.equal(logs.length, 51);
    assert.ok(logs.every(line => JSON.parse(line).enforced === false));
    assert.ok(!logs.join('').includes(normal.subjectId));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
