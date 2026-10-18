const PATTERNS = [
  {
    "name": "요청 머리글의 JNDI 원격 조회 형태",
    "condition": "User-Agent 등 요청 머리글에 JNDI 조회와 LDAP 등 원격 대상 지정이 함께 있는지 확인한다. 현재 가상 경보에서는 data.useragent와 rule.description을 참고한다. jndi 또는 Log4j라는 단어, 중괄호 하나, 라이브러리 이름만으로 일치시키지 않는다. 문서용 조회 표기는 수업 신호로만 해석하고 실제 요청으로 실행하지 않는다. 형태 일치는 악용 시도 관찰이며 서버 취약성이나 실행 성공을 증명하지 않는다.",
    "evidence": "NVD CVE-2021-44228은 공격자가 제어하는 로그 입력의 JNDI·LDAP 원격 조회 문제를 설명하고, FullHunt log4j-scan은 HTTP 머리글 검사를 명시하며, MITRE T1190은 해당 CVE 악용 사례를 수록한다: https://nvd.nist.gov/vuln/detail/CVE-2021-44228 ; https://github.com/fullhunt/log4j-scan ; https://attack.mitre.org/techniques/T1190/"
  },
  {
    "name": "요청 인자의 JNDI 원격 조회 형태",
    "condition": "요청 인자 값에 JNDI 조회와 원격 대상 지정이 함께 있는지 확인한다. 현재 가상 경보에서는 data.url의 질의 인자와 rule.description을 참고하고, 없는 요청 본문은 추정하지 않는다. 취약점 이름 검색, 문서 열람, 잘린 조회 조각만으로 완전한 악용 형태라고 단정하지 않는다. 반복은 경보에 명시된 경우에만 보조 신호로 쓰며 임의 차단 횟수를 정하지 않는다. 문서용 표기는 실행하거나 실제 공격 구문으로 변형하지 않는다.",
    "evidence": "NVD CVE-2021-44228은 로그 메시지·인자의 JNDI 원격 조회 위험을 설명하고, FullHunt log4j-scan은 요청 인자 검사를 제공하며, MITRE T1190은 공개 앱의 Log4Shell 악용을 다룬다: https://nvd.nist.gov/vuln/detail/CVE-2021-44228 ; https://github.com/fullhunt/log4j-scan ; https://attack.mitre.org/techniques/T1190/"
  },
  {
    "name": "알려진 Log4Shell 점검 도구 흔적",
    "condition": "요청 머리글이나 경보 설명에 CVE-2021-44228 점검 도구임을 확인할 수 있는 식별 정보가 명시되었는지 살핀다. log4j-scan처럼 제작자 자료로 용도가 확인된 도구와 단지 비슷한 수업용 프로그램 이름을 구분한다. 도구 이름은 위조될 수 있고 정상 점검에도 쓰이므로 단독 차단 근거로 삼지 않는다. JNDI 원격 조회 형태 및 명시된 반복 여부와 함께 검토하며, 특정 고정 User-Agent가 있다는 근거 없는 서명은 만들지 않는다.",
    "evidence": "FullHunt 제작자 문서는 log4j-scan을 CVE-2021-44228 점검 도구로 설명하고 머리글·인자 검사를 명시한다; 이는 점검 흔적의 보조 근거이며 도구 이름만으로 MITRE T1190 공격이나 성공을 확정하지 않는다: https://github.com/fullhunt/log4j-scan ; https://attack.mitre.org/techniques/T1190/"
  }
];

// 확신도는 패턴 일치 정도를 나타내는 수업용 값이며 공격 성공 확률이 아닙니다.
export function decide(alert) {
  const text = value => typeof value === 'string' ? value.slice(0, 8192) : '';
  const decode = value => {
    let out = text(value);
    for (let i = 0; i < 2; i += 1) {
      try {
        const next = decodeURIComponent(out);
        if (next === out) break;
        out = next;
      } catch { break; }
    }
    return out;
  };
  const header = decode(alert?.data?.useragent);
  const url = text(alert?.data?.url);
  const queryStart = url.indexOf('?');
  const values = queryStart < 0 ? [] : url.slice(queryStart + 1).split('#')[0]
    .split('&').slice(0, 64).map(pair => {
      const equals = pair.indexOf('=');
      return equals < 0 ? '' : decode(pair.slice(equals + 1).replace(/\+/g, ' '));
    });
  const description = text(alert?.rule?.description);
  // 문자열 형태만 검사하며 기록된 원격 대상에 접속하지 않습니다.
  // 조회 키워드뿐 아니라 프로토콜·원격 대상·닫는 괄호가 함께 있어야 완전한 형태입니다.
  const complete = value => /\$\{jndi:(?:ldap|ldaps|rmi|dns):\/\/[^\s{}\/]+(?:\/[^\s{}]*)?\}/i.test(value);
  const partial = value => /\$\{jndi(?::|\b)/i.test(value);
  let confidence = 0;
  let reason = '일치하는 근거 패턴 없음';
  if (complete(header)) {
    confidence = 0.95;
    reason = PATTERNS[0].name;
  } else if (values.some(complete)) {
    confidence = 0.95;
    reason = PATTERNS[1].name;
  } else if (partial(header)) {
    confidence = 0.65;
    reason = PATTERNS[0].name;
  } else if (values.some(partial)
    || /조회 형태가 잘린|불완전한.*(?:JNDI|원격 조회)|(?:JNDI|원격 조회).*불완전/i.test(description)) {
    confidence = 0.55;
    reason = PATTERNS[1].name;
  } else if (/\blog4j-scan\b/i.test(header)
    || (/\blog4j-scan\b/i.test(description) && !/비슷한|수업용|문서|예제/.test(description))
    || /알려진 취약점 점검 흔적/.test(description)) {
    // 확인된 점검 도구도 정상 점검일 수 있으므로 단독으로 block하지 않습니다.
    confidence = 0.6;
    reason = PATTERNS[2].name;
  }
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence, reason };
}
