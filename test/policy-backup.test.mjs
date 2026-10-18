import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { capture, simulate, preview, verify, policyFiles, hash, differences, planRestore, restoreTrial } from '../scripts/policy-backup.mjs';

test('정책 사본 검증, 한 줄 침공 비교, 운영 원본 보존과 실패 시 중단', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'vault-policy-'));
  try {
    for (const file of policyFiles) {
      await mkdir(resolve(root, file, '..'), { recursive: true });
      await writeFile(resolve(root, file), 'fixture policy\n');
    }
    await writeFile(resolve(root, 'aleph.config.json'), JSON.stringify({ step: 9,
      allowedRoutes: ['GET /api/notes/:id', 'GET /api/notices'], excluded: 'not captured' }));
    const directory = resolve(root, 'backup');
    const digest = await capture(root, directory, 'a'.repeat(40));
    const baseline = await readFile(resolve(directory, 'snapshot.json'));
    assert.equal(baseline.includes('not captured'), false);
    await verify(directory, digest);
    await simulate(directory, digest);
    const report = await preview(directory, digest);
    assert.match(report, /단계 9/);
    assert.match(report, /- 기준 2:.*GET \/api\/notes\/:id/);
    assert.match(report, /\+ 시험 2:.*POST \/api\/notes\/:id/);
    assert.equal(report.split('\n').filter(line => /^[+-] /.test(line)).length, 2);
    for (const file of policyFiles) assert.equal(await readFile(resolve(root, file), 'utf8'), 'fixture policy\n');
    assert.equal(JSON.parse(await readFile(resolve(root, 'aleph.config.json'))).allowedRoutes[0], 'GET /api/notes/:id');
    await assert.rejects(capture(root, directory, 'a'.repeat(40)), { code: 'EEXIST' });
    await assert.rejects(simulate(directory, digest), { code: 'EEXIST' });
    const routeKey = 'aleph.config.json#allowedRoutes';
    const custom = JSON.parse(await readFile(resolve(directory, 'trial.json')));
    custom[routeKey] = JSON.stringify(['POST /api/notes/:id', 'GET /api/notices', 'GET /other-service']);
    custom[policyFiles[1]] += '-- independent change\n';
    custom['other-service'] = 'preserve this rule';
    await writeFile(resolve(directory, 'trial.json'), JSON.stringify(custom));
    await writeFile(resolve(directory, 'restore-audit.jsonl'), '{"status":"prior"}\n');
    const plan = await planRestore(directory, digest);
    await assert.rejects(restoreTrial(directory, digest), /confirmation_mismatch/);
    custom['other-service'] += ' updated';
    await writeFile(resolve(directory, 'trial.json'), JSON.stringify(custom));
    await assert.rejects(restoreTrial(directory, digest, plan.confirmation), /confirmation_mismatch/);
    const fresh = await planRestore(directory, digest);
    await restoreTrial(directory, digest, fresh.confirmation);
    const restored = JSON.parse(await readFile(resolve(directory, 'trial.json')));
    assert.deepEqual(JSON.parse(restored[routeKey]), ['GET /api/notes/:id', 'GET /api/notices', 'GET /other-service']);
    for (const key of Object.keys(custom).filter(key => key !== routeKey)) assert.equal(restored[key], custom[key]);
    const audit = (await readFile(resolve(directory, 'restore-audit.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(audit.map(event => event.status), ['prior', 'intent', 'complete']);
    await assert.rejects(restoreTrial(directory, digest, fresh.confirmation), /unexpected_restore_scope/);
    assert.deepEqual(await readFile(resolve(directory, 'snapshot.json')), baseline);
    await assert.rejects(preview(resolve(root, 'missing'), digest), { code: 'ENOENT' });
    await assert.rejects(verify(directory), /trusted_hash_required/);
    await assert.rejects(verify(directory, 'b'.repeat(64)), /snapshot_hash_mismatch/);
    await writeFile(resolve(directory, 'snapshot.json'), Buffer.concat([baseline, Buffer.from(' ')]));
    await assert.rejects(simulate(directory, digest), /snapshot_hash_mismatch/);
    await assert.rejects(restoreTrial(directory, digest, fresh.confirmation), /snapshot_hash_mismatch/);
    // Replacing both adjacent files still cannot bypass the externally supplied hash.
    await writeFile(resolve(directory, 'snapshot.sha256'), hash(Buffer.concat([baseline, Buffer.from(' ')])));
    await assert.rejects(preview(directory, digest), /snapshot_hash_mismatch/);
    await writeFile(resolve(directory, 'snapshot.json'), baseline);
    await writeFile(resolve(directory, 'snapshot.sha256'), digest);
    const trial = JSON.parse(await readFile(resolve(directory, 'trial.json')));
    delete trial[policyFiles[0]];
    await writeFile(resolve(directory, 'trial.json'), JSON.stringify(trial));
    await assert.rejects(preview(directory, digest), /invalid_trial_scope/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('비교는 변경하지 않은 줄을 숨기고 삽입·삭제를 표시한다', () => {
  assert.deepEqual(differences('a\nb\nc', 'a\nx\nb\nc'), ['+ 시험 2: x']);
  assert.deepEqual(differences('a\nb\nc', 'a\nc'), ['- 기준 2: b']);
  assert.deepEqual(differences('a', 'a'), []);
});
