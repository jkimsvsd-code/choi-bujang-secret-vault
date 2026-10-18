const PATTERNS = [
  {
    "name": "요청 인자의 SQL 구문 삽입",
    "condition": "요청 인자에 SQL 문장을 이어 붙이거나 조회 조건을 바꾸는 구문 조합이 있는지 확인한다. SQL 또는 select라는 수업명, 따옴표 하나만으로 공격으로 단정하지 않는다. 같은 출발 주소의 반복 요청은 경보에 명시된 횟수로만 보조 판단하며, 문서용 doc-* 표기를 실제 공격 구문으로 해석하지 않는다.",
    "evidence": "MITRE ATT&CK T1190은 외부 공개 앱 악용을 설명하고 Agrius·APT28 등의 SQL injection 사례를 명시한다; 이 조건은 해당 사례를 참고한 관찰 신호이며 공격 성공이나 공식 탐지 임계값을 뜻하지 않는다: https://attack.mitre.org/techniques/T1190/"
  },
  {
    "name": "요청 인자의 스크립트 태그 삽입",
    "condition": "요청 인자에 <script> 같은 실제 스크립트 태그 형태가 있거나 경보 설명에 스크립트 삽입 표식이 명시되어 있는지 확인한다. script라는 수업 단어·정상 코드 예제와 구별하고, 같은 출발 주소의 반복 여부를 보조 신호로 본다. 태그 존재만으로 실행 성공이나 초기 접근 성공을 단정하지 않는다.",
    "evidence": "T1190의 웹 취약점 악용 맥락을 참고하되 스크립트 입력의 직접 근거는 MITRE CWE-79의 HTTP 요청 반영형 XSS 설명이다; 모든 XSS를 T1190으로 확정하지 않는다: https://attack.mitre.org/techniques/T1190/ 및 https://cwe.mitre.org/data/definitions/79.html"
  },
  {
    "name": "요청 인자의 상위 경로 이동 반복",
    "condition": "파일·경로 요청 인자 안에서 ../가 반복되어 여러 상위 디렉터리로 이동하려는 형태인지 확인한다. 한 인자 안의 ../ 반복과 같은 출발 주소의 요청 반복 횟수는 구분한다. up이라는 단어 하나나 정상 상대 경로만으로 공격을 단정하지 않으며, 횟수 임계값을 임의로 정하지 않는다.",
    "evidence": "MITRE ATT&CK T1190의 C0017 사례는 초기 접근에 directory traversal 취약점을 악용한 사실을 명시한다; ../ 반복은 이 과제의 관찰 신호이며 MITRE가 정한 차단 횟수 기준은 아니다: https://attack.mitre.org/techniques/T1190/"
  },
  {
    "name": "요청 인자의 명령 구분자 삽입",
    "condition": "경보 설명에 명령 구분자 표기가 명시되고, 출발 주소가 있으며 해당 요청의 반복이 확인되는지 본다. 단순 구분 문자·이름 검색·수업 예제는 이 패턴으로 단정하지 않는다. 단일 명령 구분자 의심 경보는 알림으로 남긴다.",
    "evidence": "MITRE ATT&CK T1190의 Cutting Edge 사례는 외부 공개 Ivanti 장비의 command injection 악용을 명시한다; 명령 구분자와 반복 여부는 이 과제의 관찰 신호이며 공식 횟수 기준은 아니다: https://attack.mitre.org/techniques/T1190/"
  }
];

// 확신도는 수업용 휴리스틱이며 MITRE의 임계값이나 공격 성공 확률이 아닙니다.
// 입력 크기와 디코딩 횟수를 제한하고 원본 값은 reason으로 돌려주지 않습니다.
export function decide(alert) {
  const text = value => typeof value === 'string' ? value.slice(0, 8192) : '';
  const description = text(alert?.rule?.description);
  const url = text(alert?.data?.url);
  const queryStart = url.indexOf('?');
  const query = queryStart < 0 ? '' : url.slice(queryStart + 1).split('#')[0];
  const values = query.split('&').slice(0, 64).map(pair => {
    const equals = pair.indexOf('=');
    let value = equals < 0 ? '' : pair.slice(equals + 1).replace(/\+/g, ' ');
    for (let i = 0; i < 2; i += 1) {
      try {
        const decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch { break; }
    }
    // 수업용 대체 표기는 실제 공격 구문으로 해석하지 않습니다.
    return /^doc-[a-z-]+$/i.test(value) ? '' : value;
  });
  const rawCount = alert?.data?.count;
  const parsedCount = typeof rawCount === 'number' ? rawCount
    : typeof rawCount === 'string' && /^\d{1,6}$/.test(rawCount) ? Number(rawCount) : NaN;
  const statedCount = description.match(/(\d{1,6})\s*(?:번|건)/);
  const count = Number.isInteger(parsedCount) && parsedCount >= 0 ? parsedCount
    : statedCount ? Number(statedCount[1]) : 0;
  const repeated = count > 1 && !/반복(?:은|이)?\s*없|반복되지\s*않/.test(description);
  const benign = /수업명|수업\s*(?:단어|공지)|정상\s*코드\s*예제|삽입\s*표식은\s*아닙/.test(description);
  const denied = /공격\s*표기는\s*없|삽입\s*표식은\s*아닙/.test(description);
  const evidence = [
    {
      direct: values.some(value => /\bunion\s+(?:all\s+)?select\b|\bselect\s+.+\s+from\b|['"]\s*(?:or|and)\s+\d+\s*=\s*\d+/i.test(value)),
      stated: /SQL\s*(?:구문|표식)|데이터베이스\s*조회를\s*이어\s*붙/i.test(description),
      weak: values.some(value => /['"]/.test(value)) || /따옴표/.test(description),
    },
    {
      direct: values.some(value => /<\s*script(?:\s|>)/i.test(value)),
      stated: /스크립트\s*(?:삽입|표식|표기)/.test(description),
      weak: values.some(value => /<\s*script\b/i.test(value)),
    },
    {
      direct: values.some(value => /(?:\.\.\/){2,}/.test(value)),
      stated: /경로.*(?:여러\s*단계\s*거슬러|이탈\s*표기)/.test(description),
      weak: values.some(value => /\.\.\//.test(value)),
    },
    {
      direct: false,
      stated: /명령\s*구분자\s*표기/.test(description)
        && !/명령\s*구분자\s*표기.{0,8}(?:없|아닙)/.test(description)
        && typeof alert?.data?.srcip === 'string' && alert.data.srcip.trim() !== '',
      weak: false,
    },
  ];
  let confidence = 0;
  let reason = '일치하는 근거 패턴 없음';
  evidence.forEach((signal, index) => {
    let score = 0;
    if (signal.direct) score = repeated ? 0.95 : 0.8;
    else if (signal.stated && !denied) score = repeated ? 0.9 : 0.65;
    else if (signal.weak && !denied) score = 0.5;
    if (benign && score > 0) score = Math.min(score, 0.25);
    if (score > confidence) {
      confidence = score;
      reason = PATTERNS[index].name;
    }
  });
  // 특정 패턴을 추정해 붙이지 않고, 명시적인 미확정 주입 신호만 검토합니다.
  if (confidence === 0 && /주입처럼\s*보이는/.test(description) && !denied && !benign) {
    confidence = 0.5;
    reason = '근거 패턴 미확정';
  }
  // 이 연습의 중간 수준 경보는 공격 확정이 아니라 검토 대상입니다.
  // 수업 단어/단일 표식은 차단 근거가 아니지만, 중간 수준과 함께 있으면 알림을 유지합니다.
  const level = alert?.rule?.level;
  if (confidence < 0.5 && Number.isInteger(level) && level >= 5 && level <= 9) {
    const hints = [
      /\b(?:SQL|select)\b|따옴표/i.test(description),
      /스크립트|\bscript\b/i.test(description),
      /경로.*(?:\bup\b|\.\.\/)/i.test(description),
      /구분\s*문자|명령\s*구분자/.test(description),
    ];
    const index = hints.indexOf(true);
    const uncertain = /요청\s*주소.*(?:길|깁)|이상한\s*검색|주입처럼\s*보이는/.test(description);
    if (index >= 0 || uncertain) {
      confidence = 0.5;
      reason = index >= 0 ? PATTERNS[index].name : '근거 패턴 미확정';
    }
  }
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}
