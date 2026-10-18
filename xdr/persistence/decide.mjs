const PATTERNS = [
  {
    "name": "의심스러운 서비스 등록·변경",
    "condition": "새 서비스 등록과 서명 없음, 실행 파일 교체와 서명 없음, 또는 낯선 서비스의 재시작 후 지속 등록이 명시되면 강한 신호로 본다. 임시 경로는 보조 근거다. 서명 미확인은 서명 없음과 구분한다. 서비스 설명만 변경, 같은 파일로 중단 후 재시작, 임시 실행 파일 생성만 있고 서비스 등록이 없는 경우는 지속성 확인이 필요한 약한 신호로 alert에 남긴다. 기존 서명된 서비스의 정상 실행은 record로 둔다.",
    "evidence": "MITRE ATT&CK T1543은 새 서비스 생성이나 기존 서비스 변경을 통한 반복 실행·지속성을 설명한다; 서명 없음과 임시 경로는 이 과제의 보조 관찰 신호이며 MITRE의 공식 차단 기준은 아니다: https://attack.mitre.org/techniques/T1543/"
  },
  {
    "name": "낯선 예약 작업 등록",
    "condition": "rule.description에 처음 보는 예약 작업 또는 임의 문자열 작업 이름이 명시되었는지 확인하고, 임시 폴더 실행 대상이나 수업 시간 밖 실행이 함께 명시되었는지 살핀다. data.path는 있을 때만 참고하며 경보 발생 시각을 작업 실행 시각으로 간주하지 않는다. 정상 업데이트·자료 복사 예약이나 수업 과제 이름만으로 일치시키지 않고, 낯선 이름만 있는 경우는 추가 확인 대상으로 둔다. 시작 프로그램과 예약 작업이 같은 임시 파일을 함께 가리킨다는 명시적 연결도 강한 신호로 본다. 이 조합은 T1053의 예약 실행과 자동 시작의 결합을 확인하는 수업용 조건이며 공식 차단 기준은 아니다.",
    "evidence": "MITRE ATT&CK T1053은 예약 기능을 악용해 지정 시각 또는 반복적으로 악성 코드를 실행하는 형태를 설명한다; 낯선 이름·임시 경로·수업 외 시각은 이를 검토하기 위한 과제의 관찰 신호다: https://attack.mitre.org/techniques/T1053/"
  },
  {
    "name": "시작 폴더의 낯선 프로그램 추가",
    "condition": "rule.description에 시작 폴더로 평소 목록에 없는 프로그램을 추가했다는 사실이 명시되었는지 확인하고, data.path가 있으면 Startup 경로인지 대조한다. 목록 읽기만 한 경우는 제외하며, 변경 1건만 있거나 실행 여부를 모르는 경우는 악성 실행으로 확정하지 않는다. 경보의 기술 태그만으로 분류하지 않는다.",
    "evidence": "시작 폴더 추가의 직접 근거는 T1543·T1053이 아닌 MITRE ATT&CK T1547.001이며, 로그인 때 실행되도록 시작 폴더에 프로그램을 추가하는 지속성 기법을 설명한다: https://attack.mitre.org/techniques/T1547/001/"
  }
];
// 수업용 패턴 일치 정도이며 공격 성공 확률이나 실제 차단 결과가 아닙니다.
export function decide(alert) {
  const text = value => typeof value === 'string' ? value.slice(0, 8192) : '';
  const description = text(alert?.rule?.description);
  const path = text(alert?.data?.path).replace(/\\/g, '/');
  const temporary = /임시 폴더|임시 파일/.test(description) || /\/temp\//i.test(path);
  const unsigned = /서명 없는|서명이 없습니다|서명 없음/.test(description);
  const unfamiliar = /처음 보는|평소 목록에 없는|임의 문자열/.test(description);
  const uncertain = /확인되지|아직 모릅니다|아직 모르는|확인되지 않은/.test(description);
  let confidence = 0;
  let reason = '일치하는 근거 패턴 없음';
  const match = (index, score) => {
    if (score > confidence) { confidence = score; reason = PATTERNS[index].name; }
  };

  if (/서비스/.test(description)) {
    const registration = /새 서비스|서비스 등록|서비스가.*등록/.test(description)
      && !/등록은 없습니다|등록되지 않|등록이 없/.test(description);
    const descriptionOnly = /서비스 설명만/.test(description);
    const unchanged = /같은 파일로 다시|기존.*서명된/.test(description);
    if (descriptionOnly || /멈췄다가 같은 파일로 다시/.test(description)
      || (temporary && /실행 파일.*생겼/.test(description) && /서비스 등록은 없습니다/.test(description))) match(0, 0.5);
    if (!descriptionOnly && !unchanged) {
      if (registration && unsigned) match(0, temporary ? 0.95 : 0.9);
      else if (registration && unfamiliar) match(0, /다시 켜도 남도록/.test(description) ? 0.9 : 0.7);
      else if (/실행 파일이 바뀌/.test(description) && unsigned) match(0, 0.9);
      else if (registration && uncertain) match(0, 0.55);
    }
  }

  if (/예약 작업/.test(description)) {
    const routine = /기존 예약 작업.*마쳤|정상|업데이트|자료 복사/.test(description);
    const absent = /예약 작업이 없|예약 작업은 없|예약 작업.*만들지 않/.test(description);
    if (!routine && !absent) {
      if (temporary && /시작 프로그램과 예약 작업이 같은 임시 파일을 함께 가리/.test(description)) match(1, 0.95);
      else if (unfamiliar && (temporary || /수업 시간 밖/.test(description))) match(1, 0.95);
      else if (unfamiliar) match(1, 0.65);
      else if (temporary || uncertain) match(1, 0.6);
      else if (/만들었|예약 작업이 하나|작업 이름.*수업 과제/.test(description)) match(1, 0.5);
    }
  }

  if (/시작 폴더|시작 프로그램|시작 항목/.test(description)) {
    const readOnly = /읽기만|조회만/.test(description);
    const added = /추가됐|추가되|추가했/.test(description)
      && !/추가되지 않|추가.*없/.test(description);
    const startupPath = /\/startup(?:\/|$)/i.test(path);
    const unknownExecution = /실행.*기록은 없습니다|실행 여부.*모/.test(description);
    if (!readOnly) {
      if (added && unfamiliar && !unknownExecution) match(2, !path || startupPath ? 0.9 : 0.7);
      else if (added || /변경|서명은 아직|임시 파일/.test(description)) match(2, 0.55);
    }
  }
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence, reason };
}
