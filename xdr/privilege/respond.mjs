import { readFile, writeFile, rename, appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';
import { alertFingerprint, privilegeRulesUrl, TTL_MS } from '../../src/external-deny.mjs';

// trustedBindings는 운영자가 엔진 감사 기록을 대조해 별도 작성한 로컬 파일만 받습니다.
// 경보 안의 verified/subjectId/IP/계정을 신뢰 연결로 승격하지 않습니다.
export async function respond({ now = new Date(),
  input = new URL('../fixtures/privilege.json', import.meta.url),
  trustedBindings = null, output = privilegeRulesUrl,
  candidatesOutput = new URL('./block-candidates.json', import.meta.url),
  log = new URL('../alerts.log', import.meta.url) } = {}) {
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new Error('invalid_time');
  const fixture = JSON.parse(await readFile(input, 'utf8'));
  if (fixture.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'privilege'
    || !Array.isArray(fixture.alerts)) throw new Error('invalid_fixture');
  let bindings = [];
  if (trustedBindings) {
    const document = JSON.parse(await readFile(trustedBindings, 'utf8'));
    if (document.schema !== 'aleph.xdr.trusted-bindings.v1' || !Array.isArray(document.bindings)) {
      throw new Error('invalid_bindings');
    }
    bindings = document.bindings;
  }
  const createdAt = now.toISOString();
  const expiresAt = new Date(time + TTL_MS).toISOString();
  const rules = [], candidates = [], notifications = [], seen = new Set();
  for (const alert of fixture.alerts) {
    if (!/^pv-\d{1,6}$/.test(alert?.id) || seen.has(alert.id)) throw new Error('invalid_alert_id');
    seen.add(alert.id);
    const result = decide(alert);
    if (result.action === 'record') continue;
    let type = 'alert';
    if (result.action === 'block' && result.confidence >= 0.85) {
      const digest = alertFingerprint(alert);
      const matches = bindings.filter(binding => binding.evidenceAlertId === alert.id
        && binding.alertFingerprint === digest);
      const binding = matches.length === 1 ? matches[0] : null;
      const verifiedAt = Date.parse(binding?.verifiedAt);
      const validUntil = Date.parse(binding?.expiresAt);
      const linked = binding && /^[a-f0-9]{64}$/.test(binding.requestFingerprint)
        && Number.isFinite(verifiedAt) && verifiedAt <= time && time - verifiedAt < TTL_MS
        && Number.isFinite(validUntil) && validUntil > time && validUntil - verifiedAt <= TTL_MS;
      const candidate = { evidenceAlertId: alert.id, alertFingerprint: digest,
        createdAt, expiresAt, confidence: result.confidence, reason: result.reason };
      if (linked) {
        rules.push({ ...candidate, requestFingerprint: binding.requestFingerprint,
          expiresAt: new Date(Math.min(time + TTL_MS, validUntil)).toISOString() });
        type = 'deny_rule_registered';
      } else {
        candidates.push({ ...candidate, status: 'link_required', enforced: false });
        type = 'block_candidate';
      }
    }
    notifications.push(JSON.stringify({ at: createdAt, evidenceAlertId: alert.id,
      type, confidence: result.confidence, reason: result.reason,
      ...(type === 'alert' ? {} : { expiresAt: rules.at(-1)?.evidenceAlertId === alert.id
        ? rules.at(-1).expiresAt : expiresAt }),
      enforced: false }));
  }
  // 전용 파일만 교체하고 다른 모듈의 규칙과 기존 로그는 보존합니다.
  const temporary = `${output instanceof URL ? fileURLToPath(output) : resolve(output)}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ schema: 'aleph.xdr.exact-request-deny.v1', rules }, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, output);
  await writeFile(candidatesOutput, JSON.stringify({ schema: 'aleph.xdr.block-candidates.v1', candidates }, null, 2) + '\n');
  if (notifications.length) await appendFile(log, notifications.join('\n') + '\n');
  return { alerts: fixture.alerts.length, rules: rules.length, candidates: candidates.length,
    notifications: notifications.length, enforced: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await respond({ trustedBindings: process.argv[2] || null }))); }
  catch { console.error('규칙 등록 또는 알림 기록에 실패했습니다.'); process.exitCode = 1; }
}
