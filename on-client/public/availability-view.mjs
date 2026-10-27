const resources = [['me','로그인'],['devices','기기'],['sessions','세션'],['apps','업무 앱 목록'],['access','업무 앱 접속 판정'],['events','보안 기록']];
export function describeAvailability(resource) {
  if (!resource || resource.status === 'idle') return '조회 전';
  if (resource.status === 'loading') return '조회 중 · 응답 대기';
  if (resource.status !== 'ok') return '확인 불가 · 조회 또는 응답 검증 실패';
  if (resource.meta?.mode === 'demo') return '예제 자료';
  if (resource.meta?.mode === 'connected') return '서버 자료(실제 응답)';
  if (resource.meta?.mode === 'disconnected') return '확인 불가 · 연결 없음';
  return '확인 불가 · 출처 미확인';
}
export function renderAvailability(root, state) {
  const add=(parent,tag,text)=>{const node=document.createElement(tag);node.textContent=text;parent.appendChild(node);return node;};
  root.replaceChildren();
  add(root,'p','PC 상태·구성 조회: 이 PC를 일반 권한으로 직접 읽는 기능입니다. 버튼을 눌러야 조회하며, 성공 여부는 각 항목의 결과에서 확인하세요.');
  add(root,'p','예제는 설명용이고 서버 자료는 실제 응답입니다. 어느 쪽도 PC 실측이나 실제 업무 접속 성공을 뜻하지 않습니다. 확인 불가 항목은 다시 조회하거나 연결 상태를 확인하세요.');
  add(root,'p','화면 전체 조회 기준입니다. 개별 카드에서 다시 조회한 결과는 해당 카드의 출처와 시각을 확인하세요.');
  const wrap=add(root,'div','');wrap.className='availability-table-wrap';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','현재 이용 범위 표');
  const table=add(wrap,'table','');add(table,'caption','최근 응답의 자료 구분과 확인 시각');
  const header=add(add(table,'thead',''),'tr','');
  for(const title of ['항목','자료 구분','확인 시각'])add(header,'th',title).scope='col';
  const body=add(table,'tbody','');
  for(const [key,label] of resources){
    const r=state[key];const at=r?.meta?.checkedAt;
    const stamp=typeof at==='string'&&Number.isFinite(Date.parse(at))?new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':'제공되지 않음';
    const row=add(body,'tr','');add(row,'th',label).scope='row';add(row,'td',describeAvailability(r));add(row,'td',stamp);
  }
  add(root,'p','SDP 연결: PC 조회 성공과 별개입니다. 보호 현황의 SDP 상태 확인 결과를 확인하세요. 예제 자료나 연결된 자료 표시만으로 SDP 연결 성공을 판단하지 않습니다.');
  add(root,'p','패키지·AI 기능: 별도 설정과 권한이 필요합니다. 앱 전체 모드가 아닌 각 기능의 조회·연결 결과를 확인하세요.');
}
