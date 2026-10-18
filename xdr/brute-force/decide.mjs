const PATTERNS = [
  {
    "name": "같은 출발 주소의 단시간 로그인 실패 연속",
    "condition": "data.srcip가 같은 출발 주소에서 짧은 시간에 로그인 실패가 반복되는지 경보 설명의 시간 범위와 실패 건수로 확인한다. 단일 timestamp를 집계 시간으로 해석하지 않으며, 구체적인 시간·횟수 임계값은 이 자료에서 정하지 않는다.",
    "evidence": "MITRE ATT&CK T1110은 비밀번호를 반복·체계적으로 추측하는 공격을 설명하며, 같은 주소의 단시간 실패 연속은 이 과제에서 찾는 관찰 신호다: https://attack.mitre.org/techniques/T1110/"
  },
  {
    "name": "여러 계정에 같은 비밀번호 대입",
    "condition": "경보 설명에 여러 계정을 대상으로 같은 비밀번호를 대입했다는 정보가 있는지 확인한다. 계정 수나 같은 출발 주소만으로 비밀번호가 같다고 추정하지 않으며, 실제 비밀번호 값은 수집하거나 비교·출력하지 않는다.",
    "evidence": "MITRE ATT&CK T1110.003(Password Spraying)은 하나 또는 소수의 비밀번호를 여러 계정에 대입하는 T1110의 하위 기법이다: https://attack.mitre.org/techniques/T1110/003/"
  }
];

// 확신도와 수치 기준은 이 연습용 휴리스틱이며 MITRE가 정한 임계값이 아닙니다.
// 실패 20건 이상과 level 10 이상은 보조 신호이며, 실패 설명과 출발 주소도 함께 확인합니다.
export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string'
    ? alert.rule.description.slice(0, 4096) : '';
  const level = Number.isInteger(alert?.rule?.level) ? alert.rule.level : 0;
  const source = typeof alert?.data?.srcip === 'string' && alert.data.srcip.trim() !== '';
  const rawCount = alert?.data?.count;
  const dataCount = typeof rawCount === 'number' || (typeof rawCount === 'string' && /^\d{1,9}$/.test(rawCount))
    ? Number(rawCount) : NaN;
  // '계정 20개'를 실패 횟수로 오인하지 않고, '실패 20건'만 읽습니다.
  const match = description.match(/실패(?:가)?\s*(\d{1,9})\s*건/);
  const textCount = match ? Number(match[1]) : NaN;
  const count = Number.isFinite(dataCount) && dataCount >= 0 ? dataCount : textCount;
  const failure = /실패/.test(description) && !/실패(?:가)?\s*(?:없|0\s*건)/.test(description);
  const multipleAccounts = /여러\s*계정|계정\s*\d+\s*개|서로\s*다른\s*계정|계정\s*이름을\s*바꿔/.test(description);
  const samePassword = /같은\s*비밀번호|동일한?\s*비밀번호/.test(description);
  const attempt = failure || /넣었|대입|시도/.test(description);
  const shortWindow = /\d+\s*(?:초|분)\s*(?:안|동안|내)/.test(description);
  const repeated = Number.isFinite(count) && count >= 2;
  let confidence = 0;
  let pattern = null;

  if (multipleAccounts && samePassword && attempt) {
    pattern = PATTERNS[1];
    confidence = 0.95;
  } else if (failure) {
    pattern = PATTERNS[0];
    if (source && repeated && count >= 20 && level >= 10) {
      confidence = shortWindow ? 0.95 : 0.86;
    } else if (repeated || /연속|이어졌|반복/.test(description)) {
      confidence = 0.6;
    } else {
      confidence = 0.25;
    }
  }

  return {
    action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence,
    reason: pattern ? pattern.name : '일치하는 근거 패턴 없음',
  };
}
