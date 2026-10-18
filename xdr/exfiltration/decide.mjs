const PATTERNS = [
  {
    "name": "처음 보는 목적지로 대용량 전송",
    "condition": "경보 설명에 처음 보는 목적지와 대용량 또는 다량 자료의 외부 전송이 함께 명시되는지 확인하고 data.dstip·bytes·files를 보조 자료로 대조한다. 목적지 이력이나 전송량 기준이 없으면 주소·바이트 수만으로 처음 보는 곳 또는 대용량이라고 추정하지 않는다. 승인된 백업·정상 전송 근거도 함께 확인한다. 명령 통로와 프로토콜 정보가 없으면 T1041 또는 T1048로 확정하지 않는다.",
    "evidence": "MITRE T1041은 기존 명령·제어 통로를 통한 유출, T1048은 그 통로와 다른 프로토콜을 통한 유출 및 다른 목적지 사용을 설명하며 T1048의 탐지 전략은 이례적인 대량 외부 전송을 다룬다; 이 신호만으로 유출이 입증되지는 않는다: https://attack.mitre.org/techniques/T1041/ , https://attack.mitre.org/techniques/T1048/"
  },
  {
    "name": "업무 시간 밖 압축 파일 반출",
    "condition": "경보 설명에 업무·수업 시간 밖이라는 정보와 압축 파일의 외부 전송이 함께 명시되는지 확인한다. 처음 보는 목적지는 보조 신호로 살피며, 업무 일정 자료 없이 timestamp만으로 업무 시간을 정하지 않는다. 압축 파일 생성만 있거나 전송이 실패·취소된 경우 완료된 반출로 보지 않고 승인된 예약 백업 여부도 확인한다. 전송 프로토콜과 명령 통로의 관계가 없으면 특정 ATT&CK 기법으로 확정하지 않는다.",
    "evidence": "MITRE T1048은 다른 프로토콜로 유출하는 형태를 설명하고 Bundlore의 압축 자료 전송 사례와 업무 시간 밖 전송 탐지 전략을 제시한다; 시간 이탈과 압축 파일은 확인 신호이며 공격 확정 조건은 아니다: https://attack.mitre.org/techniques/T1048/"
  }
];

// 수업용 설명의 패턴 일치도입니다. 실제 유출·통신 기법의 입증이 아닙니다.
export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string'
    ? alert.rule.description.slice(0, 8192) : '';
  let confidence = 0;
  let reason = '일치하는 근거 패턴 없음';
  const match = (index, score) => {
    if (score > confidence) {
      confidence = score;
      reason = PATTERNS[index].name;
    }
  };

  // 시각·주소·규칙 수준·바이트 수만으로 평소 행동이나 업무 시간을 추정하지 않습니다.
  const unfamiliar = /처음 보는 (?:목적지|주소)|목적지는 처음|평소와 다른 주소|낯선 (?:목적지|주소)|다른 주소/.test(description);
  const offHours = /(?:업무|수업) 시간 밖/.test(description);
  const archive = /압축 파일/.test(description);
  const large = /대용량|큰 파일|다량|메모 묶음|자료실 전체/.test(description)
    && !/큰 파일은 아|대용량은 아|다량은 아/.test(description);
  // 다수 자료를 한 번에 내보냈다는 서술은 묶음 전송의 근거입니다.
  const batch = /자료\s*(\d+)건.*(?:나갔|전송됐|전송했|복사됐)/.exec(description);
  const bulk = large || (batch !== null && Number(batch[1]) > 1
    && !/전송은\s*1건|일부만/.test(description));
  const transfer = /나갔|올라갔|전송|복사됐|반출/.test(description);
  const incomplete = /실패|취소|(?:전송|반출)(?:은|이)?\s*(?:아직\s*)?없|전송되지 않|전송하지 않|나가지 않/.test(description);
  const approved = /승인된 (?:백업|전송|예약)|정상 (?:백업|전송)|허가된 (?:백업|전송)/.test(description)
    && !/승인되지 않|승인된 .*아님|정상 .*아님|허가된 .*아님/.test(description);

  if (transfer && !approved) {
    if (unfamiliar && bulk) match(0, incomplete ? 0.5 : 0.9);
    else if (unfamiliar || bulk || /전송량이 평소보다|파일 수가 .*늘었/.test(description)) {
      match(0, 0.55);
    }
    if (offHours && archive) match(1, incomplete ? 0.5 : 0.9);
    else if (archive || offHours) match(1, 0.55);
  }

  // 압축만 하고 아직 전송하지 않은 경우는 반출 패턴의 약한 일치입니다.
  if (archive && incomplete && !unfamiliar && !offHours) {
    confidence = 0.25;
    reason = PATTERNS[1].name;
  }
  return {
    action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence,
    reason,
  };
}
