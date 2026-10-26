export function createHistoryView(root, request) {
  let generation = 0;
  let rows = [];
  const add=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;root.append(node);return node;};
  add('p','위 타임라인은 현재 조회 결과이며, 이 영역만 과거 조회 이력을 보관합니다. 최근 30일 · 전체 저장 한도 1,000건. 조회마다 별도 기록하며 사건 원문은 저장하지 않습니다. 과거 이력은 현재 보안 상태나 조치 근거가 아닙니다.');
  const load=add('button','저장된 이력 다시 조회');load.type='button';
  const kind=add('select','');kind.setAttribute('aria-label','저장 이력 종류');
  for(const [value,text] of [['all','전체'],['access','접속 기록'],['xdr','XDR 경보']]){const option=document.createElement('option');option.value=value;option.textContent=text;kind.append(option);}
  const status=add('p','저장된 이력 조회 전');status.setAttribute('role','status');
  const list=add('ol','');
  const label=add('label','현재 계정·모드의 저장 이력만 삭제함을 확인합니다. ');
  const confirmed=document.createElement('input');confirmed.type='checkbox';label.append(confirmed);
  const clear=add('button','확인한 조회 이력 삭제');clear.type='button';clear.disabled=true;
  confirmed.addEventListener('change',()=>{clear.disabled=!confirmed.checked||rows.length===0;});
  const render=()=>{
    list.replaceChildren();
    const visible=rows.filter(row=>kind.value==='all'||row.kind===kind.value);
    for(const row of visible){const li=document.createElement('li');li.textContent=`${row.mode==='demo'?'예제 · 실제 PC 조회 아님':'연결 원천 조회 · PC 전체 측정 아님'} | 조회 시각 ${row.queriedAt} | 사건 발생 시각 ${row.occurredAt} | ${row.kind}`;list.append(li);}
    status.textContent=`저장된 이력 ${visible.length}건 / 조회된 ${rows.length}건${rows.length===0?' · 보관된 기록 없음':''}`;
  };
  kind.addEventListener('change',render);
  async function refresh(saveFailed=false){
    const gen=++generation;rows=[];list.replaceChildren();confirmed.checked=false;clear.disabled=true;
    status.textContent='저장된 이력 확인 중';
    const result=await request('/api/history');
    if(gen!==generation)return;
    if(!result.ok||!Array.isArray(result.data)){status.textContent='이력 조회 실패 · 빈 이력이나 저장 성공으로 판단하지 마세요.';return;}
    if(result.data.some(row=>!['demo','connected'].includes(row.mode)||!['access','xdr'].includes(row.kind)||!Number.isFinite(Date.parse(row.queriedAt))||!Number.isFinite(Date.parse(row.occurredAt)))){status.textContent='이력 형식 확인 불가';return;}
    rows=result.data;render();
    if(saveFailed)status.textContent+=' · 이번 조회 저장 실패. 자동 재시도하지 않습니다.';
  }
  load.addEventListener('click',()=>refresh());
  clear.addEventListener('click',async()=>{
    if(!confirmed.checked||rows.length===0)return;
    const queryId=rows[0].queryId;
    ++generation;clear.disabled=true;confirmed.checked=false;rows=[];list.replaceChildren();
    const result=await request('/api/history/clear',{method:'POST',body:{queryId}});
    if(!result.ok){status.textContent='삭제 결과 확인 불가 · 다시 조회해 확인하세요.';return;}
    await refresh();
  });
  return {refresh,reset(){++generation;rows=[];list.replaceChildren();confirmed.checked=false;clear.disabled=true;status.textContent='현재 조회가 끝난 뒤 이력을 확인합니다.';}};
}
