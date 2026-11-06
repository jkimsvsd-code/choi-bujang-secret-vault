export function createHistoryView(root, request, {demo=false}={}) {
  let generation=0,rows=[],busy=false,notice='';
  const time=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST';
  const add=(parent,tag,text)=>{const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;};
  add(root,'p',(demo?'예제 체험 이력 · 브라우저 메모리에만 보관되며 실제 저장 이력과 별개입니다. ':'')+'저장된 조회 이력입니다. 새 보안 기록을 조회하는 기능은 아니며, 과거 이력은 현재 보안 상태나 조치 근거가 아닙니다.').className='feature-note';
  const overview=add(root,'p','최근 조회: 확인 전');overview.className='history-overview';
  const controls=add(root,'div','');controls.className='history-controls';
  const load=add(controls,'button','이력 다시 불러오기');load.type='button';
  const label=add(controls,'label','기록 종류 '),kind=add(label,'select','');kind.setAttribute('aria-label','저장 이력 종류');
  for(const [v,t] of [['all','전체'],['access','접속 기록'],['xdr','XDR 경보']])add(kind,'option',t).value=v;
  const status=add(controls,'p','저장된 이력 조회 전');status.className='filter-count';status.setAttribute('role','status');
  const disclosure=add(root,'details','');disclosure.className='history-disclosure';
  const summary=add(disclosure,'summary','조회 이력 · 확인 전');
  const wrap=add(disclosure,'div','');wrap.className='history-table-wrap';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','전체 조회 이력 표');
  const table=add(wrap,'table','');add(table,'caption','조회 시각 최신순 · 한 행은 조회한 기록 하나입니다. 같은 사건이 반복될 수 있으며 사건 원문은 저장하지 않습니다.');
  const head=add(add(table,'thead',''),'tr','');for(const title of ['조회 시각','사건 발생 시각','기록 종류','자료 출처'])add(head,'th',title).scope='col';
  const list=add(table,'tbody','');
  const management=add(root,'details','');add(management,'summary','이력 관리');
  add(management,'p','최근 30일 · 전체 저장 한도 1,000건. 아래 삭제는 필터와 무관하게 현재 계정·모드의 저장 이력 전체에 적용됩니다.');
  const consent=add(management,'label','현재 계정·모드의 저장 이력만 삭제함을 확인합니다. ');
  const confirmed=add(consent,'input','');confirmed.type='checkbox';
  const clear=add(management,'button','확인한 조회 이력 삭제');clear.type='button';clear.disabled=true;
  const enable=()=>{load.disabled=busy;confirmed.disabled=busy;clear.disabled=busy||!confirmed.checked||!rows.length;root.setAttribute('aria-busy',String(busy));};
  confirmed.addEventListener('change',enable);
  const render=()=>{
    list.replaceChildren();
    const visible=rows.filter(r=>kind.value==='all'||r.kind===kind.value).sort((a,b)=>Date.parse(b.queriedAt)-Date.parse(a.queriedAt)||Date.parse(b.occurredAt)-Date.parse(a.occurredAt));
    for(const r of visible){
      const row=add(list,'tr','');add(row,'th',time(r.queriedAt)).scope='row';add(row,'td',time(r.occurredAt));add(row,'td',r.kind==='access'?'접속 기록':'XDR 경보');add(row,'td',r.mode==='demo'?'예제 · 실제 PC 조회 아님':'서버 자료 · PC 전체 측정 아님');
    }
    if(!visible.length){const cell=add(add(list,'tr',''),'td',rows.length?'조건에 맞는 기록 없음 · 전체 종류로 바꿔 보세요.':'보관된 기록 없음');cell.colSpan=4;}
    const latest=rows.length?time(Math.max(...rows.map(r=>Date.parse(r.queriedAt)))):'없음';
    overview.textContent=`${demo?'예제':'저장된'} 기록 ${rows.length}건 · 최근 조회 ${latest}`;
    summary.textContent=`조회 이력 표 · 표시 ${visible.length}/${rows.length}건 · 최근 조회 ${latest}`;
    status.textContent=`표시 ${visible.length}건${notice}`;
  };
  kind.addEventListener('change',()=>{if(!busy&&rows.length)render();});
  async function refresh(saveFailed=false){
    const gen=++generation;busy=true;rows=[];notice=saveFailed?' · 이번 조회 저장 실패. 자동 재시도하지 않습니다.':'';list.replaceChildren();confirmed.checked=false;enable();
    summary.textContent='조회 이력 · 확인 중';overview.textContent='최근 조회: 확인 중';status.textContent='저장된 이력 확인 중';
    try{
      const result=await request('/api/history');if(gen!==generation)return;
      if(!result.ok||!Array.isArray(result.data))throw Error();
      if(result.data.some(r=>!r||r.mode!==(demo?'demo':'connected')||!['access','xdr'].includes(r.kind)||typeof r.queryId!=='string'||!Number.isFinite(Date.parse(r.queriedAt))||!Number.isFinite(Date.parse(r.occurredAt))))throw Error();
      rows=result.data;render();
    }catch{if(gen===generation){summary.textContent='조회 이력 · 확인 불가';overview.textContent='최근 조회: 확인 불가';status.textContent='이력 조회 실패 · 빈 이력이나 저장 성공이 아닙니다. 연결 상태를 확인하고 이력 다시 불러오기를 누르세요.'+notice;}}
    finally{if(gen===generation){busy=false;enable();}}
  }
  load.addEventListener('click',()=>{if(!busy)return refresh();});
  clear.addEventListener('click',async()=>{
    if(busy||!confirmed.checked||!rows.length)return;
    const queryId=rows[0].queryId,gen=++generation;busy=true;confirmed.checked=false;rows=[];list.replaceChildren();enable();
    summary.textContent='조회 이력 · 삭제 후 재확인 필요';overview.textContent='최근 조회: 삭제 후 재확인 필요';status.textContent='확인한 이력 삭제 중';
    try{const result=await request('/api/history/clear',{method:'POST',body:{queryId}});if(gen!==generation)return;if(!result.ok)throw Error();await refresh();}
    catch{if(gen===generation)status.textContent='삭제 결과 확인 불가 · 이력 다시 불러오기로 확인하세요.';}
    finally{if(gen===generation){busy=false;enable();}}
  });
  return {refresh,reset(){++generation;rows=[];busy=false;list.replaceChildren();confirmed.checked=false;enable();summary.textContent='조회 이력 · 확인 전';overview.textContent='최근 조회: 확인 전';status.textContent='현재 조회가 끝난 뒤 이력을 확인합니다.';}};
}
