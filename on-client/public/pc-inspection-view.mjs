const names={network:'네트워크 구성',firewall:'방화벽 설정',system:'System 기록',application:'Application 기록'};
const time=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':'확인 불가';
export function createPcInspectionView(root,request){
  const add=(p,t,text)=>{const n=document.createElement(t);n.textContent=text;p.append(n);return n;};
  add(root,'p','일반 권한·읽기 전용 조회입니다. 방화벽·보안 설정을 변경하지 않습니다. 아래 실측은 보안 기록의 demo 예제와 구분됩니다.');
  add(root,'p','Windows 경고·오류 건수는 침해나 공격 탐지 결과가 아닙니다. 최근 24시간 동안 현재 로그에 남아 있는 경고(Level 3)·오류(Level 2)만 집계하며, 로그 삭제·보존 제한으로 누락될 수 있습니다.').className='inspection-notice';
  add(root,'p','네트워크는 IP 사용 구성 어댑터를 조회하며, 주소는 이 PC의 로컬 조회 이력에 저장됩니다. 외부 전송하지 않습니다. 방화벽 True/False는 프로필 활성 설정이며 현재 네트워크 프로필의 선택 여부가 아닙니다. NotConfigured는 해당 필드 미지정으로, 실제 허용·차단을 추정하지 않습니다.');
  const sdp=add(root,'section','');sdp.setAttribute('aria-label','별도 SDP 연결 상태');
  add(sdp,'h3','SDP 연결 상태 · PC 조회와 별개');
  const sdpText=add(sdp,'p','SDP 연결 확인 전 · PC 조회 성공은 SDP 연결 성공이 아닙니다.');sdpText.setAttribute('role','status');
  const sdpButton=add(sdp,'button','SDP 상태 확인');sdpButton.type='button';sdpButton.className='btn';
  sdpButton.addEventListener('click',async()=>{
    sdpButton.disabled=true;sdpText.textContent='SDP 연결 확인 중';
    try{const r=await request('/api/pc-inspection/sdp');
      const d=r.data;
      sdpText.textContent=r.ok&&d&&['connected','disconnected','unknown'].includes(d.status)?
        `${d.status==='connected'?'SDP 세션 연결 확인':d.status==='disconnected'?'SDP 미연결':'SDP 연결 확인 불가'} · ${d.reason} · 확인 시각 ${time(d.checkedAt)}`:
        `SDP 연결 확인 불가 · ${r.error?.message||'응답 형식 오류'}`;
    }catch{sdpText.textContent='SDP 연결 확인 불가 · 요청 실패';}finally{sdpButton.disabled=false;}
  });
  const controls=add(root,'div','');controls.className='inspection-controls';
  const query=add(controls,'button','PC 구성·기록 조회'),history=add(controls,'button','PC 구성 이력 조회');
  for(const b of [query,history]){b.type='button';b.className='btn';}
  const label=add(controls,'label','기록 종류 '),filter=add(label,'select','');filter.setAttribute('aria-label','PC 구성 기록 종류');
  for(const [key,value] of [['all','전체'],...Object.entries(names)])add(filter,'option',value).value=key;
  const message=add(root,'p','조회 전 · 자동 조회하지 않습니다.');message.setAttribute('role','status');
  const list=add(root,'ol','');list.className='inspection-timeline';list.setAttribute('aria-label','PC 구성 조회 타임라인');
  let records=[];
  const valid=r=>r&&r.source==='measured'&&Number.isFinite(Date.parse(r.queriedAt))&&Array.isArray(r.sections)&&r.sections.length===4&&r.sections.every(s=>Object.hasOwn(names,s.kind)&&['ok','unknown'].includes(s.status)&&Array.isArray(s.rows));
  function render(){
    const opened=new Set([...list.querySelectorAll('details[open]')].map(d=>d.dataset.at));list.replaceChildren();
    for(const [index,r] of [...records].sort((a,b)=>Date.parse(b.queriedAt)-Date.parse(a.queriedAt)).entries()){
      const li=add(list,'li',''),details=add(li,'details','');details.dataset.at=r.queriedAt;details.open=opened.has(r.queriedAt)||index===0;
      add(details,'summary',`${time(r.queriedAt)} · 실측${index===0?' · 최신 조회':''}`);
      if(r.saved===false)add(details,'p','저장 실패 · 이번 화면에서만 확인할 수 있습니다.');
      for(const s of r.sections.filter(s=>filter.value==='all'||s.kind===filter.value)){
        add(details,'h4',names[s.kind]);
        add(details,'p',`조회 완료/시도 시각 ${time(s.checkedAt)} · 실측 · ${s.status==='ok'?'읽기 성공':'확인 불가'}`);
        if(['system','application'].includes(s.kind))add(details,'p',`집계 구간 ${time(r.windowStart)} ~ ${time(r.windowEnd)} · 24시간 · 단위: 건`);
        if(s.status!=='ok'){add(details,'p',`확인 불가 · ${s.reason||'실패 이유를 확인하지 못했습니다.'}`).className='inspection-notice';continue;}
        if(!s.rows.length){add(details,'p','조회 결과: 해당 구성 항목 없음');continue;}
        const wrap=add(details,'div','');wrap.className='inspection-table-wrap';wrap.tabIndex=0;
        const table=add(wrap,'table','');add(table,'caption',`${names[s.kind]} · 실측`);
        const head=add(add(table,'thead',''),'tr','');for(const v of ['항목','값','단위'])add(head,'th',v).scope='col';
        const body=add(table,'tbody','');
        for(const row of s.rows){const tr=add(body,'tr','');add(tr,'th',row.label).scope='row';add(tr,'td',row.value);add(tr,'td',row.unit);}
      }
    }
  }
  async function load(measuring){
    query.disabled=true;history.disabled=true;message.textContent=measuring?'일반 권한으로 읽는 중…':'저장된 이력 조회 중…';
    let current;
    try{
      if(measuring){const r=await request('/api/pc-inspection',{method:'POST',body:{}});
        if(!r.ok||!valid(r.data))throw Error(r.error?.message||'조회 응답 확인 불가');current=r.data;}
      const r=await request('/api/pc-inspection/history');
      if(!r.ok||!Array.isArray(r.data)||!r.data.every(valid)){
        if(current){records=[current];render();}
        message.textContent='이력 확인 불가 · 저장된 기록을 읽지 못했습니다. 표시된 자료의 조회 시각을 확인하세요.';return;
      }
      records=r.data;
      if(current){records=records.filter(r=>r.queriedAt!==current.queriedAt);records.unshift(current);}
      render();const unknown=current?.sections.filter(s=>s.status==='unknown').length;
      message.textContent=`실측 조회 이력 ${records.length}건 · 최근 30일, 최대 1,000회${current?` · 이번 조회 ${4-unknown}/4개 항목 성공, ${unknown}개 확인 불가`:''}${current?.saved===false?' · 저장 실패':''} · SDP 상태와 별개입니다.`;
    }catch(e){message.textContent=`확인 불가 · ${e.message||'요청 실패'} · 표시된 이력은 이전 자료입니다.`;}
    finally{query.disabled=false;history.disabled=false;}
  }
  query.addEventListener('click',()=>load(true));history.addEventListener('click',()=>load(false));filter.addEventListener('change',render);
}
