// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 등록 기기의 자료실 읽기만 허용하고, 그 밖의 요청은 기본 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'connection_input', 'compound_access_step_up']);

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

export async function decide(request) {
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

  if (request.service === 'notes' && request.method === 'GET') {
    // 기존 가상 사건의 risk_signal을 다량 조회 신호로 사용합니다.
    // 실제 위치·개인별 평소 시각을 추정하지 않고 지역은 조건에서 제외합니다.
    const compoundRisk = connection.source === 'judge_fixture'
      && connection.hour < 6
      && connection.network === 'unusual'
      && connection.recentEvents.some(event => event.kind === 'risk_signal'
        && event.ageSeconds <= 60 && event.count >= 20);
    if (compoundRisk) {
      // 계약상 verified 값만으로 엔진의 추가 확인 요청을 생략하지 않습니다.
      return {
        schema: 'aleph.decision.v1',
        requestId: request.requestId,
        decision: 'step_up',
        reasonCode: 'step_up_required',
        ruleIds: ['compound_access_step_up'],
      };
    }
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'allow',
      reasonCode: 'approved',
      ruleIds: ['device_registered'],
    };
  }

  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'deny',
    reasonCode: 'starter_not_ready',
    ruleIds: [RULE_IDS[0]],
  };
}
