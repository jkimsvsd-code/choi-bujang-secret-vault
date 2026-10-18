const PATTERNS = [
  {
    "name": "평범한 계정의 관리자 그룹 추가",
    "condition": "rule.description에 관리자 그룹 추가가 명시되었는지 확인하고 data.group이 있으면 administrators와 대조한다. 원격 주소에서의 추가나 추가 직후 관리자 명령 실행이 명시되면 함께 검토한다. 일반 과제 그룹 추가·그룹 조회·설명 변경은 제외한다. 관리자 그룹 추가만으로 계정 도용이나 취약점 악용을 확정하지 않는다.",
    "evidence": "MITRE ATT&CK T1078은 기존 계정의 자격증명 악용으로 높은 권한에 접근하는 형태를 설명한다; 관리자 그룹 추가는 이 과제의 보조 관찰 신호이며 그 자체가 T1078의 도용 증거는 아니다: https://attack.mitre.org/techniques/T1078/"
  },
  {
    "name": "권한 상승 뒤 낯선 관리자 명령 실행",
    "condition": "rule.description에 권한 상승 직후 관리자 명령 실행 또는 평소와 다른 관리자 명령 실행이 명시되었는지 확인한다. 처음 보는 출발 주소는 보조 신호로만 쓰며 처음 보는 명령과 구분한다. 취소된 권한 상승 창·실패한 명령·단순 세션 조회를 성공한 권한 사용으로 세지 않는다. 취약점 악용 근거가 없으면 T1068 확정이 아닌 추가 확인 대상으로 둔다.",
    "evidence": "MITRE ATT&CK T1068은 소프트웨어 취약점 악용을 통한 권한 상승을 설명한다; 상승 후 관리자 명령은 결과를 살피는 보조 신호이며 명령 실행만으로 취약점 악용을 입증하지 않는다: https://attack.mitre.org/techniques/T1068/"
  },
  {
    "name": "업무 시간 밖의 이례적인 권한 사용",
    "condition": "rule.description에 업무·수업 시간 밖 관리자 명령 실행 또는 관리자 권한 사용이 명시되고 낯선 출발 주소나 관리자 그룹 추가가 함께 있는지 확인한다. 업무 일정 자료가 없으므로 timestamp만으로 업무 시간을 임의 정의하지 않는다. 평소 관리 계정의 로그인·로그아웃과 정상 예약 작업 확인은 이 패턴에서 제외하며 시간 이탈만으로 도용을 확정하지 않는다.",
    "evidence": "MITRE ATT&CK T1078은 정상 계정의 자격증명을 악용한 접근·권한 사용을 설명한다; 업무 시간 이탈과 낯선 주소의 조합은 이 과제의 확인 조건이며 MITRE가 정한 공격 확정 기준은 아니다: https://attack.mitre.org/techniques/T1078/"
  }
];

// 확신도는 수업용 패턴 일치 정도이며 도용·취약점 악용의 입증이나 실제 차단이 아닙니다.
export function decide(alert) {
  const text = value => typeof value === 'string' ? value.slice(0, 8192) : '';
  const description = text(alert?.rule?.description);
  const group = text(alert?.data?.group).toLowerCase();
  let confidence = 0;
  let reason = '일치하는 근거 패턴 없음';
  const match = (index, score) => {
    if (score > confidence) {
      confidence = score;
      reason = PATTERNS[index].name;
    }
  };

  const groupMention = /관리자 그룹/.test(description);
  const groupDenied = /관리자 그룹은 아닙|관리자 그룹이 아님|추가되지 않|추가하지 않|추가는 없|추가가 없/.test(description);
  const added = groupMention && !groupDenied
    && /추가됐|추가되|추가했|추가와|들어가고|들어왔/.test(description);
  const groupConflict = added && group !== '' && group !== 'administrators';
  const unsuccessful = /취소|실패|실행하지 않|실행되지 않|명령은 없|명령이 없/.test(description);
  const command = /관리자 명령|권한 명령/.test(description)
    && /실행했|실행됐|실행되|명령 실행/.test(description) && !unsuccessful;
  const elevated = /방금 관리자가 된|관리자 권한으로 바뀌|권한 상승|관리자 그룹에 들어가고/.test(description);
  const unfamiliarAddress = /처음 보는 주소|주소는 처음|낯선.*주소/.test(description);
  const unfamiliarCommand = /처음 보는 관리자 명령|평소와 다른 관리자 명령|낯선 관리자 명령/.test(description);
  const offHours = /(?:업무|수업) 시간 밖|업무처럼 보이지 않는 시각/.test(description);
  const remote = /원격 주소/.test(description);

  // 그룹 변경에 대한 직접 서술이 필요하며 그룹 이름이나 수준만으로 판단하지 않습니다.
  if (added) {
    if (groupConflict) match(0, 0.5);
    else if (remote || command) match(0, 0.9);
    else match(0, 0.65);
  }

  // 권한 상승 결과와 취약점 악용 증거를 구분합니다.
  const exploitation = /취약점.*악용|취약점.*이용해/.test(description)
    && !/악용.*없|악용.*미확인|악용.*확인되지|악용하지 않/.test(description);
  if (command && (elevated || unfamiliarCommand || /다른 계정의 권한/.test(description))) {
    match(1, elevated && exploitation ? 0.95 : 0.7);
  } else if (/권한 상승/.test(description) || (elevated && unfamiliarAddress)) {
    match(1, unsuccessful ? 0.5 : 0.6);
  } else if (/관리자 명령/.test(description) && unsuccessful) {
    match(1, 0.5);
  }

  // 업무 시간은 설명의 명시적 신호만 사용하고 시각·IP로 추정하지 않습니다.
  if (offHours && (command || elevated || added)) {
    match(2, !groupConflict && (unfamiliarAddress || added) ? 0.9 : 0.6);
  }

  return {
    action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence,
    reason,
  };
}
