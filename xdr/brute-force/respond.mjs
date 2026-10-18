import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const fixtureUrl = new URL('../fixtures/brute-force.json', import.meta.url);
const candidatesUrl = new URL('./block-candidates.json', import.meta.url);
const logUrl = new URL('../alerts.log', import.meta.url);
const TTL_MS = 15 * 60 * 1000;

// 검토용 후보만 저장합니다. ZTNA 규칙 등록이나 실제 차단은 수행하지 않습니다.
export async function respond({ now = new Date(), input = fixtureUrl,
  output = candidatesUrl, log = logUrl } = {}) {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) throw new Error('invalid_time');
  const fixture = JSON.parse(await readFile(input, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'brute-force'
    || !Array.isArray(fixture.alerts)) throw new Error('invalid_fixture');
  const createdAt = now.toISOString();
  const expiresAt = new Date(timestamp + TTL_MS).toISOString();
  const candidates = [];
  const notifications = [];
  const seen = new Set();
  for (const alert of fixture.alerts) {
    // 원본이나 오류에 포함된 임의 문자열을 로그로 내보내지 않습니다.
    if (typeof alert?.id !== 'string' || !/^bf-\d{1,6}$/.test(alert.id)
      || seen.has(alert.id)) throw new Error('invalid_alert_id');
    seen.add(alert.id);
    const result = decide(alert);
    if (result.action === 'record') continue;
    let candidate = null;
    if (result.action === 'block' && result.confidence >= 0.85) {
      const sourceAddress = alert?.data?.srcip;
      if (typeof sourceAddress !== 'string' || !isIP(sourceAddress)) {
        throw new Error('invalid_candidate_address');
      }
      candidate = {
        evidenceAlertId: alert.id, sourceAddress,
        createdAt, expiresAt, confidence: result.confidence,
        reason: result.reason, status: 'review_required', enforced: false,
      };
      candidates.push(candidate);
    }
    notifications.push(JSON.stringify({
      at: createdAt, alertId: alert.id,
      type: candidate ? 'block_candidate' : 'alert',
      confidence: result.confidence, reason: result.reason,
      ...(candidate ? { expiresAt } : {}), enforced: false,
    }));
  }
  // 재실행하면 후보 목록을 교체하고 알림 로그는 이어 씁니다.
  await writeFile(output, JSON.stringify({
    schema: 'aleph.xdr.block-candidates.v1', moduleKey: 'brute-force',
    generatedAt: createdAt, ttlSeconds: TTL_MS / 1000,
    enforced: false, candidates,
  }, null, 2) + '\n', 'utf8');
  if (notifications.length) await appendFile(log, notifications.join('\n') + '\n', 'utf8');
  return { alerts: fixture.alerts.length, candidates: candidates.length,
    notifications: notifications.length, enforced: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await respond()));
  } catch {
    console.error('후보 저장 또는 알림 기록에 실패했습니다. 실제 차단은 수행하지 않았습니다.');
    process.exitCode = 1;
  }
}
