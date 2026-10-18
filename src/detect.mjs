// 9단계에서 학생이 채우는 탐지 함수입니다. 이 기본값은 어떤 접속도 회수하지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  for (const event of events) {
    // 사건 전체를 복사하거나 기록하지 않고 계약의 세 값만 읽습니다.
    const at = event?.at;
    const method = event?.method;
    const sub = event?.identity?.sub;
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))
      || typeof method !== 'string' || method.trim().length === 0
      || typeof sub !== 'string' || sub.trim().length === 0) {
      throw new TypeError('invalid_detection_events');
    }
  }
  // 이번 단계는 입력 확인만 수행하며 폭주 판정·회수 제안은 추가하지 않습니다.
  return { action: 'observe' };
}
