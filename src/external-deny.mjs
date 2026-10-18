import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const rulesUrl = new URL('../xdr/web-injection/deny-rules.json', import.meta.url);
export const knownCveRulesUrl = new URL('../xdr/known-cve/deny-rules.json', import.meta.url);
export const persistenceRulesUrl = new URL('../xdr/persistence/deny-rules.json', import.meta.url);
export const TTL_MS = 15 * 60 * 1000;
const fields = ['schema', 'requestId', 'classId', 'projectId', 'subjectId', 'deviceId',
  'service', 'method', 'path', 'route', 'queryLength', 'querySha256', 'at', 'policyRevision'];

// 엔진이 확인한 동일 요청 하나만 지정합니다. IP/계정 추정이나 광역 차단은 없습니다.
export function requestFingerprint(request) {
  if (!request || fields.some(key => request[key] === undefined)) return null;
  if (request.schema !== 'aleph.decision.v1' || !Number.isInteger(request.queryLength)
    || request.queryLength < 0 || !Number.isInteger(request.policyRevision) || request.policyRevision < 0
    || fields.filter(key => key !== 'queryLength' && key !== 'policyRevision')
      .some(key => typeof request[key] !== 'string' || !request[key] || request[key].length > 8192)) return null;
  return createHash('sha256').update(JSON.stringify(fields.map(key => request[key]))).digest('hex');
}

export function alertFingerprint(alert) {
  // 원문은 파일/로그에 복사하지 않고 신뢰 연결 자료와 같은 경보인지 대조합니다.
  return createHash('sha256').update(JSON.stringify(alert)).digest('hex');
}

export async function matchesExternalDeny(request, { file, now = Date.now() } = {}) {
  const fingerprint = requestFingerprint(request);
  if (!fingerprint) return false;
  // 각 모듈의 전용 파일을 독립적으로 읽습니다. 한 파일의 누락은 다른 규칙을 지우지 않습니다.
  const sources = file ? [[file, /^(?:wi|kc|ps)-\d{1,6}$/]]
    : [[rulesUrl, /^wi-\d{1,6}$/], [knownCveRulesUrl, /^kc-\d{1,6}$/],
      [persistenceRulesUrl, /^ps-\d{1,6}$/]];
  for (const [source, evidenceId] of sources) {
    if (await matchesFile(source, evidenceId, fingerprint, now)) return true;
  }
  return false;
}

async function matchesFile(file, evidenceId, fingerprint, now) {
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    if (data.schema !== 'aleph.xdr.exact-request-deny.v1' || !Array.isArray(data.rules)) return false;
    return data.rules.some(rule => {
      const start = Date.parse(rule.createdAt);
      const end = Date.parse(rule.expiresAt);
      return evidenceId.test(rule.evidenceAlertId)
        && rule.requestFingerprint === fingerprint && /^[a-f0-9]{64}$/.test(rule.alertFingerprint)
        && Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end
        && end > start && end - start <= TTL_MS;
    });
  } catch {
    // 연결 자료가 없거나 손상되어도 기존 판정 조건을 우회하거나 일괄 차단하지 않습니다.
    return false;
  }
}
