const resources = [['me','로그인'],['devices','기기'],['sessions','세션'],['apps','업무 앱 목록'],['access','업무 앱 접속 판정'],['events','보안 기록']];
export function describeAvailability(resource) {
  if (!resource || resource.status === 'idle') return '조회 전 · 아직 확인하지 않았습니다.';
  if (resource.status === 'loading') return '조회 중 · 응답 대기';
  if (resource.status !== 'ok') return '확인 불가 · 조회 실패 또는 응답 검증 실패. 다시 조회하거나 연결 상태를 확인하세요.';
  if (resource.meta?.mode === 'demo') return '예제 자료 · 설명용이며 실제 이용 가능 판정이 아닙니다.';
  if (resource.meta?.mode === 'connected') return '연결된 자료 · 이 응답의 출처이며 실제 업무 접속·SDP 연결 성공과는 별개입니다.';
  if (resource.meta?.mode === 'disconnected') return '확인 불가 · 연결 없음. 연결 상태를 확인하세요.';
  return '확인 불가 · 응답 출처를 확인할 수 없습니다.';
}
export function renderAvailability(root, state) {
  const add=(parent,tag,text)=>{const node=document.createElement(tag);node.textContent=text;parent.appendChild(node);return node;};
  root.replaceChildren();
  add(root,'p','PC 상태·구성 조회: 이 PC를 일반 권한으로 직접 읽는 기능입니다. 버튼을 눌러야 조회하며, 성공 여부는 각 항목의 결과에서 확인하세요.');
  add(root,'p','아래 목록은 공통 화면에서 최근 받은 응답 기준입니다. 학생 카드에서 따로 다시 조회한 결과는 해당 카드의 출처와 시각을 확인하세요.');
  const list=add(root,'ul','');
  for(const [key,label] of resources){
    const r=state[key];const at=r?.meta?.checkedAt;
    const stamp=typeof at==='string'&&Number.isFinite(Date.parse(at))?new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':'제공되지 않음';
    add(list,'li',`${label}: ${describeAvailability(r)} · 응답 확인 시각: ${stamp}`);
  }
  add(root,'p','SDP 연결: PC 조회 성공과 별개입니다. 보호 현황의 SDP 상태 확인 결과를 확인하세요. 예제 자료나 연결된 자료 표시만으로 SDP 연결 성공을 판단하지 않습니다.');
  add(root,'p','패키지·AI 기능: 별도 설정과 권한이 필요합니다. 앱 전체 모드가 아닌 각 기능의 조회·연결 결과를 확인하세요.');
}
