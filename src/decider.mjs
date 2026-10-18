// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 등록 기기의 자료실 읽기만 허용하고, 그 밖의 요청은 기본 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
import { matchesExternalDeny } from './external-deny.mjs';
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'connection_input', 'step_up_required', 'resource_zones', 'external_deny']);

// Explicit engine/API route pairs; never choose an operation from a query.
// IDs are opaque single path segments, not necessarily UUIDs. Ownership stays in the API.
function readableZone(request) {
  if (request.method !== 'GET' || request.queryLength !== 0) return null;
  for (const prefix of ['', '/api']) {
    if (request.service === 'notices' && request.path === `${prefix}/notices`
      && request.route === `GET ${prefix}/notices`) return 'notices';
    const base = `${prefix}/notes/`;
    if (request.service !== 'notes' || request.route !== `GET ${base}:id`
      || typeof request.path !== 'string' || !request.path.startsWith(base)) continue;
    let id;
    try { id = decodeURIComponent(request.path.slice(base.length)); }
    catch { continue; }
    // No nested paths, URL delimiters, ambiguous decoding or reserved export operation.
    if (!id || /[\/\\?#%\u0000-\u0020\u007f]/u.test(id)
      || id === '.' || id === '..' || id.toLowerCase() === 'export') continue;
    return 'notes';
  }
  // Instructor materials, admin routes and unknown services/paths are never allowed here.
  // Instructor notice editing belongs to a separately authorized server management route.
  return null;
}

// 이 검사는 엔진 전용 호출 경계 안에서만 유효합니다. source 문자열 자체는
// 인증 증거가 아니며 클라이언트 헤더·본문을 이 입력으로 변환하지 않습니다.
export function inspectConnectionInput(request) {
  const signals = request?.signals;
  const events = request?.recentEvents;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(signals) || !Array.isArray(events) || events.length > 12) return null;
  if (!events.every(event => object(event)
    && typeof event.kind === 'string' && event.kind.length > 0
    && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0
    && Number.isInteger(event.count) && event.count >= 0)) return null;

  const validHour = Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23;
  if (signals.source === 'judge_fixture') {
    if (!['local', 'foreign', 'unknown'].includes(signals.region)
      || !['usual', 'unusual', 'unknown'].includes(signals.network)
      || !validHour) return null;
  } else if (signals.source === 'none') {
    if (signals.region !== 'unknown' || signals.network !== 'unknown'
      || !(signals.hour === null || validHour)) return null;
  } else {
    return null;
  }

  // unknown은 그대로 유지하며 빈 사건 배열과 사건 정보 누락을 구분합니다.
  return {
    source: signals.source,
    region: signals.region,
    network: signals.network,
    hour: signals.hour,
    recentEvents: events.map(({ kind, ageSeconds, count }) => ({ kind, ageSeconds, count })),
  };
}

async function decideExisting(request) {
  if (request.deviceRegistered !== true) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: ['device_registered'],
    };
  }

  const connection = inspectConnectionInput(request);
  if (connection === null) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'starter_not_ready',
      ruleIds: ['connection_input'],
    };
  }

  const zone = readableZone(request);
  if (zone !== null) {
    // 기존 가상 사건의 risk_signal을 다량 조회 신호로 사용합니다.
    // 실제 위치·개인별 평소 시각을 추정하지 않고 지역은 조건에서 제외합니다.
    const compoundRisk = zone === 'notes' && connection.source === 'judge_fixture'
      && connection.hour < 6
      && connection.network === 'unusual'
      && connection.recentEvents.some(event => event.kind === 'risk_signal'
        && event.ageSeconds <= 60 && event.count >= 20);
    if (compoundRisk) {
      // 엔진 전용 계약의 가상 재확인 결과와 나이를 함께 검사합니다.
      // 실제 동일 주체의 새 로그인 검증·자료 차단 연결은 별도 실측 대상입니다.
      const stepUp = request.stepUp;
      const recentlyVerified = stepUp?.verified === true
        && Number.isFinite(stepUp.authAgeSeconds)
        && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 300;
      return {
        schema: 'aleph.decision.v1',
        requestId: request.requestId,
        decision: recentlyVerified ? 'allow' : 'step_up',
        reasonCode: recentlyVerified ? 'approved' : 'step_up_required',
        ruleIds: ['step_up_required'],
      };
    }
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'allow',
      reasonCode: 'approved',
      ruleIds: ['device_registered', 'resource_zones'],
    };
  }

  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'deny',
    reasonCode: 'starter_not_ready',
    ruleIds: [RULE_IDS[0], 'resource_zones'],
  };
}

export async function decide(request) {
  const result = await decideExisting(request);
  if (result.decision !== 'allow' || !await matchesExternalDeny(request)) return result;
  return { schema: result.schema, requestId: result.requestId, decision: 'deny',
    reasonCode: 'starter_not_ready', ruleIds: ['external_deny'] };
}
