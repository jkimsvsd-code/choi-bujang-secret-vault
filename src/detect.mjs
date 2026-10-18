// 9단계 탐지 함수입니다. 회수를 제안하며 직접 접속을 회수하지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const readsBySubject = new Map();
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
    if (method === 'GET') {
      if (!readsBySubject.has(sub)) readsBySubject.set(sub, []);
      readsBySubject.get(sub).push(Date.parse(at));
    }
  }
  for (const [subject, times] of readsBySubject) {
    // 입력 순서와 무관하게 사용자별 시각을 정렬하고 10분 창을 이동합니다.
    times.sort((a, b) => a - b);
    let left = 0;
    for (let right = 0; right < times.length; right += 1) {
      while (times[right] - times[left] > 10 * 60 * 1000) left += 1;
      if (right - left + 1 > 120) {
        return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
      }
    }
  }
  return { action: 'observe' };
}
