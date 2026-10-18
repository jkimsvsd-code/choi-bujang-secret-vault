import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, open, rename, unlink, appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const policyFiles = [
  'src/decider.mjs',
  'supabase/step3_notes_crud.sql',
  'supabase/step4_notes_rls.sql',
  'supabase/step5_notes_server_only.sql',
  'supabase/step8_resource_permissions.sql',
];
const routeKey = 'aleph.config.json#allowedRoutes';
const keys = [...policyFiles, routeKey];
export const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

export async function capture(root, destination, commit) {
  const policies = {};
  for (const file of policyFiles) policies[file] = await readFile(resolve(root, file), 'utf8');
  const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
  if (!Array.isArray(config.allowedRoutes) || !config.allowedRoutes.every(v => typeof v === 'string')) {
    throw new Error('invalid_allowed_routes');
  }
  policies[routeKey] = json(config.allowedRoutes);
  const snapshot = { format: 1, commit, step: config.step,
    dbScope: 'repository SQL definitions only; apply order 3,4,5,8; not a live DB export',
    policies, hashes: Object.fromEntries(keys.map(key => [key, hash(policies[key])])) };
  // A new directory is mandatory: never overwrite an existing baseline or trial.
  await mkdir(destination);
  const bytes = json(snapshot);
  await writeFile(resolve(destination, 'snapshot.json'), bytes, { flag: 'wx' });
  await writeFile(resolve(destination, 'snapshot.sha256'), hash(bytes) + '\n', { flag: 'wx' });
  return hash(bytes);
}

export async function verify(directory, expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash ?? '')) throw new Error('trusted_hash_required');
  const bytes = await readFile(resolve(directory, 'snapshot.json'));
  const stored = (await readFile(resolve(directory, 'snapshot.sha256'), 'utf8')).trim();
  if (stored !== expectedHash || hash(bytes) !== expectedHash) throw new Error('snapshot_hash_mismatch');
  const snapshot = JSON.parse(bytes);
  if (snapshot.format !== 1 || !/^[a-f0-9]{40}$/.test(snapshot.commit)
    || JSON.stringify(Object.keys(snapshot.policies).sort()) !== JSON.stringify([...keys].sort())
    || JSON.stringify(Object.keys(snapshot.hashes).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error('invalid_snapshot');
  }
  for (const key of keys) {
    if (typeof snapshot.policies[key] !== 'string' || hash(snapshot.policies[key]) !== snapshot.hashes[key]) {
      throw new Error('policy_hash_mismatch');
    }
  }
  return snapshot;
}

export async function simulate(directory, expectedHash) {
  const snapshot = await verify(directory, expectedHash);
  const trial = { ...snapshot.policies };
  const routes = JSON.parse(trial[routeKey]);
  const index = routes.indexOf('GET /api/notes/:id');
  if (index < 0) throw new Error('simulation_rule_missing');
  routes[index] = 'POST /api/notes/:id';
  trial[routeKey] = json(routes);
  await writeFile(resolve(directory, 'trial.json'), json(trial), { flag: 'wx' });
}

// Line LCS produces only changed lines, including insertions and deletions.
export function differences(before, after) {
  const a = before.split('\n'), b = after.split('\n');
  if (a.length * b.length > 4_000_000) throw new Error('diff_too_large');
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const changes = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; }
    else if (i < a.length && (j === b.length || dp[i + 1][j] >= dp[i][j + 1])) {
      changes.push(`- 기준 ${i + 1}: ${a[i++]}`);
    } else changes.push(`+ 시험 ${j + 1}: ${b[j++]}`);
  }
  return changes;
}

export async function preview(directory, expectedHash) {
  const snapshot = await verify(directory, expectedHash);
  const trial = JSON.parse(await readFile(resolve(directory, 'trial.json'), 'utf8'));
  if (!trial || JSON.stringify(Object.keys(trial).sort()) !== JSON.stringify([...keys].sort())
    || !keys.every(key => typeof trial[key] === 'string')) throw new Error('invalid_trial_scope');
  const changes = keys.filter(key => trial[key] !== snapshot.policies[key]);
  return [`복원 기준: ${snapshot.commit} / 단계 ${snapshot.step}`,
    `검증 SHA-256: ${expectedHash}`,
    '비교 방향: - 검증한 기준 사본 / + 시험 정책 (복원 시 +를 -로 되돌릴 범위)',
    `변경 범위: ${changes.length ? changes.join(', ') : '없음'}`,
    '운영 변경·DB 실행·복원: 없음. DB 사본은 로컬 SQL 정의입니다.',
    ...changes.flatMap(key => [`--- ${key}`, ...differences(snapshot.policies[key], trial[key])])].join('\n');
}

// Only undo the simulated notes route replacement. Other services and policy
// definitions are deliberately retained, even when they differ from baseline.
export async function planRestore(directory, expectedHash) {
  const snapshot = await verify(directory, expectedHash);
  const before = await readFile(resolve(directory, 'trial.json'), 'utf8');
  const trial = JSON.parse(before);
  if (!trial || Array.isArray(trial) || !keys.every(key => typeof trial[key] === 'string')) {
    throw new Error('invalid_trial_scope');
  }
  const safeRoutes = JSON.parse(snapshot.policies[routeKey]);
  const routes = JSON.parse(trial[routeKey]);
  const safe = 'GET /api/notes/:id', attacked = 'POST /api/notes/:id';
  if (!Array.isArray(safeRoutes) || !safeRoutes.includes(safe) || safeRoutes.includes(attacked)
    || !Array.isArray(routes) || !routes.every(value => typeof value === 'string')
    || routes.filter(value => value === attacked).length !== 1 || routes.includes(safe)) {
    throw new Error('unexpected_restore_scope');
  }
  routes[routes.indexOf(attacked)] = safe;
  trial[routeKey] = json(routes);
  const after = json(trial);
  const confirmation = hash(json({ expectedHash, before: hash(before), after: hash(after) }));
  return { before, after, confirmation, commit: snapshot.commit,
    report: [`복원 기준: ${snapshot.commit} / 단계 ${snapshot.step}`,
      `검증 SHA-256: ${expectedHash}`,
      '대상: trial.json의 allowedRoutes 중 메모 한 건 경로 한 줄',
      `- ${attacked}`, `+ ${safe}`,
      '다른 서비스 규칙·DB 정의·기존 감사 이력은 보존합니다. 운영 정책은 변경하지 않습니다.',
      `확인 코드: ${confirmation}`].join('\n') };
}

export async function restoreTrial(directory, expectedHash, confirmation) {
  const lockPath = resolve(directory, 'restore.lock');
  const lock = await open(lockPath, 'wx');
  let temporary;
  try {
    const plan = await planRestore(directory, expectedHash);
    if (!confirmation || confirmation !== plan.confirmation) throw new Error('confirmation_mismatch');
    const id = randomUUID();
    const event = { id, at: new Date().toISOString(), commit: plan.commit,
      baselineHash: expectedHash, beforeHash: hash(plan.before), afterHash: hash(plan.after),
      scope: 'trial.allowedRoutes: POST /api/notes/:id -> GET /api/notes/:id' };
    // Never truncate audit history. An interrupted run leaves an intent event.
    const audit = resolve(directory, 'restore-audit.jsonl');
    await appendFile(audit, JSON.stringify({ ...event, status: 'intent' }) + '\n');
    temporary = resolve(directory, `trial-${id}.tmp`);
    await writeFile(temporary, plan.after, { flag: 'wx' });
    await verify(directory, expectedHash);
    if (await readFile(resolve(directory, 'trial.json'), 'utf8') !== plan.before) {
      throw new Error('trial_changed_after_preview');
    }
    await rename(temporary, resolve(directory, 'trial.json'));
    temporary = undefined;
    await appendFile(audit, JSON.stringify({ ...event, status: 'complete' }) + '\n');
    return '시험 정책 한 줄 복원 완료. 감사 이력에 추가 기록했습니다.';
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const [command, name, expectedHash, flag, confirmation] = process.argv.slice(2);
  if (!['capture', 'simulate', 'preview', 'restore-plan', 'restore'].includes(command) || !/^[a-zA-Z0-9_-]+$/.test(name ?? '')) {
    throw new Error('usage: policy:backup capture|simulate|preview|restore-plan|restore NAME [TRUSTED_SHA256] [--confirm CODE]');
  }
  const parent = resolve(root, 'artifacts/policy-backups');
  const directory = resolve(parent, name);
  if (command === 'capture') {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    // Require all policy sources to match the version displayed to the user.
    const dirty = execFileSync('git', ['status', '--porcelain', '--', ...policyFiles, 'aleph.config.json'],
      { cwd: root, encoding: 'utf8' });
    if (dirty.trim()) throw new Error('policy_sources_not_committed');
    await mkdir(parent, { recursive: true });
    console.log(`기준 commit: ${commit}\nSHA-256: ${await capture(root, directory, commit)}\n저장 위치: ${directory}`);
  } else if (command === 'simulate') {
    await verify(directory, expectedHash);
    console.log('시험 사본만 생성: allowedRoutes의 GET /api/notes/:id → POST /api/notes/:id');
    await simulate(directory, expectedHash);
    console.log(await preview(directory, expectedHash));
  } else if (command === 'restore-plan' || command === 'restore') {
    console.log((await planRestore(directory, expectedHash)).report);
    if (command === 'restore') {
      if (flag !== '--confirm') throw new Error('confirmation_required: 먼저 restore-plan 결과를 확인하세요');
      console.log(await restoreTrial(directory, expectedHash, confirmation));
    }
  } else console.log(await preview(directory, expectedHash));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`중단: ${error.code ?? error.message}`); process.exitCode = 1; });
}
