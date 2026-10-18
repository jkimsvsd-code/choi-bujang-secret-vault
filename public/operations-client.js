export function summaryLines(s) {
  if (s?.schema !== 1 || !/^[0-9a-f-]{36}$/i.test(s.snapshotId ?? '')
    || !Number.isFinite(Date.parse(s.checkedAt)) || s.rules?.status !== 'configured'
    || !Array.isArray(s.rules.ids) || s.rules.count !== s.rules.ids.length
    || !s.rules.ids.every(id => typeof id === 'string' && /^[a-z_.]+$/.test(id))
    || s.rules.verdictCount !== null || s.detection?.status !== 'not_connected' || s.detection.count !== null
    || s.revocation?.status !== 'not_connected' || s.revocation.count !== null
    || s.recovery?.execution !== 'not_run'
    || !['verified_preview', 'unavailable'].includes(s.recovery.status)
    || (s.recovery.status === 'verified_preview' ? !/^[a-f0-9]{64}$/.test(s.recovery.version ?? '') : s.recovery.version !== null)) {
    throw new Error('invalid_summary');
  }
  return [
    `판정기 규칙: 서버 구현 ${s.rules.count}개 — ${s.rules.ids.join(', ')}. 실제 판정 횟수: 미확인.`,
    '탐지 사건: 미실행·운영 사건 연동 없음 (건수 미확인).',
    '회수 상태: 미실행·운영 회수 결과 연동 없음 (건수 미확인). 탐지 제안은 회수 완료가 아닙니다.',
    s.recovery.status === 'verified_preview'
      ? `복구 버전: ${s.recovery.version} (SHA-256). API에서 사본 미리보기 검증 확인. 이번 조회에서 복원 실행: 미실행.`
      : `복구 버전: 확인 불가 — ${s.recovery.reason === 'not_authorized' ? '현재 계정에 미리보기 권한 없음' : '미리보기 조회 실패'}. 이번 조회에서 복원 실행: 미실행.`,
    `확인 시각: ${s.checkedAt} / 요약 ID: ${s.snapshotId}`,
  ];
}

export function createOperationsView({ output, button, getHeaders, onDenied, fetcher = fetch }) {
  let generation = 0;
  function clear() {
    generation++;
    button.disabled = true;
    output.textContent = '미실행 — 로그인과 기기 승인 후 요약을 확인해 주세요.';
  }
  async function refresh() {
    const headers = getHeaders();
    if (!headers) { clear(); return; }
    const current = ++generation;
    button.disabled = true;
    output.textContent = '서버 요약 확인 중…';
    try {
      const response = await fetcher('/api/operations', { headers, cache: 'no-store' });
      if (current !== generation) return;
      if (response.status === 401 || response.status === 403) { onDenied(); clear(); return; }
      if (!response.ok) throw new Error('summary_failed');
      const summary = await response.json();
      if (current !== generation) return;
      output.textContent = summaryLines(summary).join('\n\n');
    } catch {
      if (current === generation) output.textContent = '확인 불가 — API 응답을 확인하지 못했습니다. 이전 수치는 표시하지 않습니다.';
    } finally {
      if (current === generation) button.disabled = !getHeaders();
    }
  }
  button.addEventListener('click', () => void refresh());
  return { clear, refresh };
}
