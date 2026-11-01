const names={network:'네트워크 구성',firewall:'방화벽 설정',system:'System 기록',application:'Application 기록'};
const time=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':'확인 불가';
export function createPcInspectionView(root,request,{demo=false}={}){
  const provenance=demo?"예제 · 실제 PC 조회 아님":"실측";
  const add=(p,t,text)=>{const n=document.createElement(t);n.textContent=text;p.append(n);return n;};
  add(root,'p',demo?'설명용 예제 PC 구성입니다. 실제 네트워크·방화벽·Windows 기록을 읽거나 변경하지 않습니다.':'이 PC의 일반 권한·읽기 전용 조회입니다. 방화벽·보안 설정을 변경하지 않습니다.').className='feature-note';
  add(root,'p','최근 24시간 Windows 경고·오류 건수는 침해나 공격 탐지 결과가 아닙니다.').className='inspection-notice';
  add(root,'p',demo?'예제 주소·건수·시각이며, 이 브라우저 메모리에서만 보관합니다.':'네트워크 주소는 이 PC의 로컬 조회 이력에 저장됩니다. 외부 전송하지 않습니다.').className='feature-note';
  const message=add(root,'p','조회 전 · 자동 조회하지 않습니다.');message.setAttribute('role','status');message.className='inspection-status-message';
  const controls=add(root,'div','');controls.className='inspection-controls';
  const query=add(controls,'button',demo?'예제 PC 구성·기록 보기':'PC 구성·기록 조회'),history=add(controls,'button',demo?'예제 구성 이력 보기':'저장된 PC 구성 보기');
  query.type='button';query.className='btn btn-primary';history.type='button';history.className='btn';
  const label=add(controls,'label','기록 종류 '),filter=add(label,'select','');filter.setAttribute('aria-label','PC 구성 기록 종류');
  for(const [key,value] of [['all','전체'],...Object.entries(names)])add(filter,'option',value).value=key;
  const help=add(root,'details','');help.className='feature-help';add(help,'summary','조회 범위와 결과 읽는 법');
  add(help,'p','최근 24시간 동안 현재 로그에 남아 있는 경고(Level 3)·오류(Level 2)만 집계하며, 로그 삭제·보존 제한으로 누락될 수 있습니다. 집계 구간이 겹치는 기록의 건수를 합산하지 마세요.');
  add(help,'p','네트워크는 IP 사용 구성 어댑터를 조회합니다. 방화벽 True/False는 프로필 활성 설정이며 현재 네트워크 프로필의 선택 여부가 아닙니다. NotConfigured는 해당 필드 미지정으로, 실제 허용·차단을 추정하지 않습니다.');
  add(help,'p','저장된 PC 구성 보기는 이전 결과만 불러옵니다. 새로 읽으려면 PC 구성·기록 조회를 누르세요.');
  const list=add(root,'ol','');list.className='inspection-timeline';list.setAttribute('aria-label','PC 구성 조회 타임라인');
  const windows=add(root,'div','');windows.className='inspection-windows';
  let records=[];
  const expanded=new Map();
  const valid=r=>r&&r.source===(demo?'example':'measured')&&Number.isFinite(Date.parse(r.queriedAt))&&Array.isArray(r.sections)&&r.sections.length===4&&r.sections.every(s=>Object.hasOwn(names,s.kind)&&['ok','unknown'].includes(s.status)&&Array.isArray(s.rows));
  function render(){
    const opened=new Set([...list.querySelectorAll('details[open]')].map(d=>d.dataset.at));list.replaceChildren();
    const ordered=[...records].sort((a,b)=>Date.parse(b.queriedAt)-Date.parse(a.queriedAt));
    for(const [index,r] of ordered.entries()){
      if(!['all','network','firewall'].includes(filter.value))continue;
      const li=add(list,'li',''),details=add(li,'details','');details.dataset.at=r.queriedAt;details.open=opened.has(r.queriedAt)||index===0;
      add(details,'summary',`${time(r.queriedAt)} · ${provenance}${index===0?' · 최신 조회':''}`);
      if(r.saved===false)add(details,'p','저장 실패 · 이번 화면에서만 확인할 수 있습니다.');
      for(const s of r.sections.filter(s=>['network','firewall'].includes(s.kind)&&(filter.value==='all'||s.kind===filter.value))){
        add(details,'h4',names[s.kind]);
        add(details,'p',`조회 완료/시도 시각 ${time(s.checkedAt)} · ${provenance} · ${s.status==='ok'?'읽기 성공':'확인 불가'}`);
        if(['system','application'].includes(s.kind))add(details,'p',`집계 구간 ${time(r.windowStart)} ~ ${time(r.windowEnd)} · 24시간 · 단위: 건`);
        if(s.status!=='ok'){add(details,'p',`확인 불가 · ${s.reason||'실패 이유를 확인하지 못했습니다.'}`).className='inspection-notice';continue;}
        if(!s.rows.length){add(details,'p','조회 결과: 해당 구성 항목 없음');continue;}
        const wrap=add(details,'div','');wrap.className='inspection-table-wrap';wrap.tabIndex=0;
        const table=add(wrap,'table','');add(table,'caption',`${names[s.kind]} · ${provenance}`);
        const head=add(add(table,'thead',''),'tr','');for(const v of ['항목','값','단위'])add(head,'th',v).scope='col';
        const body=add(table,'tbody','');
        for(const row of s.rows){const tr=add(body,'tr','');add(tr,'th',row.label).scope='row';add(tr,'td',row.value);add(tr,'td',row.unit);}
      }
    }
    windows.replaceChildren();
    const count=(section,label)=>{
      const row=section?.rows.find(r=>r.label===label);
      return section?.status==='ok'&&row?.unit==='건'&&/^\d+$/.test(row.value)?row.value:null;
    };
    for(const kind of ['system','application']){
      if(filter.value!=='all'&&filter.value!==kind)continue;
      const group=add(windows,'section','');group.setAttribute('aria-label',`${names[kind]} 집계`);
      add(group,'h3',`${names[kind]} · 최신 경고·오류`);
      if(!ordered.length){add(group,'p','조회 자료 없음 · PC 구성·기록 조회 또는 저장된 PC 구성 보기를 누르세요.');continue;}
      const latest=ordered[0],current=latest.sections.find(s=>s.kind===kind);
      add(group,'p',`${provenance} · 최신 조회 ${time(latest.queriedAt)} · 완료/시도 ${time(current?.checkedAt)}`);
      add(group,'p',`최근 24시간 집계: ${time(latest.windowStart)} ~ ${time(latest.windowEnd)}`);
      if(latest.saved===false)add(group,'p','저장 실패 · 이번 화면에서만 확인 가능').className='inspection-notice';
      const cards=add(group,'div','');cards.className='inspection-count-cards';
      for(const label of ['경고 (Level 3)','오류 (Level 2)']){
        const card=add(cards,'article','');card.className='inspection-count-card';
        add(card,'h4',label);
        const value=count(current,label);
        add(card,'p',value===null?'확인 불가':`${value} 건`).className='inspection-count-value';
        if(value===null)add(card,'p',current?.reason||'집계 항목을 확인할 수 없습니다.');
      }
      const details=add(group,'details','');details.open=expanded.get(kind)??false;
      details.addEventListener('toggle',()=>{if(details.isConnected)expanded.set(kind,details.open);});
      add(details,'summary',`${names[kind]} 조회 이력 · ${ordered.length}회 · 최신순`);
      const wrap=add(details,'div','');wrap.className='inspection-table-wrap';wrap.tabIndex=0;
      wrap.setAttribute('role','region');wrap.setAttribute('aria-label',`${names[kind]} 시간대별 집계 표`);
      const table=add(wrap,'table','');table.className='inspection-count-table';
      add(table,'caption',`${provenance} · 각 행은 조회 시점까지 최근 24시간 집계입니다. 집계 구간이 겹치므로 행의 건수를 합산하지 마세요.`);
      const head=add(table,'thead',''),top=add(head,'tr','');
      const date=add(top,'th','조회 시각 / 집계 구간');date.rowSpan=2;date.scope='col';
      for(const label of ['경고 (Level 3)','오류 (Level 2)']){const th=add(top,'th',label);th.colSpan=2;th.scope='colgroup';}
      const state=add(top,'th','완료/시도 시각 · 상태 / 이유');state.rowSpan=2;state.scope='col';
      const sub=add(head,'tr','');for(const label of ['값','단위','값','단위'])add(sub,'th',label).scope='col';
      const body=add(table,'tbody','');
      for(const record of ordered){
        const section=record.sections.find(s=>s.kind===kind),tr=add(body,'tr','');
        const at=add(tr,'th',`조회 ${time(record.queriedAt)}`);at.scope='row';
        add(at,'span',`${time(record.windowStart)} ~ ${time(record.windowEnd)} · 24시간`).className='inspection-window';
        let complete=true;
        for(const label of ['경고 (Level 3)','오류 (Level 2)']){
          const value=count(section,label);if(value===null)complete=false;
          add(tr,'td',value??'확인 불가');add(tr,'td','건');
        }
        add(tr,'td',`${time(section?.checkedAt)} · ${complete?`${provenance} · 읽기 성공`:`확인 불가 · ${section?.reason||'집계 항목 누락 또는 형식 오류'}`}${record.saved===false?' · 저장 실패':''}`);
      }
    }
  }
  async function load(measuring){
    query.disabled=true;history.disabled=true;message.textContent=measuring?(demo?'예제 자료 준비 중…':'일반 권한으로 읽는 중…'):'저장된 이력 조회 중…';
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
      message.textContent=`${demo?'예제 · 실제 조회 아님 · ':''}${measuring?'이번 PC 구성·기록 조회 결과입니다.':'저장된 결과를 불러왔습니다. PC 구성을 새로 조회하지 않았습니다.'} · 조회 이력 ${records.length}건 · ${demo?'현재 브라우저의 예제 자료':'최근 30일, 최대 1,000회'}${current?` · 이번 조회 ${4-unknown}/4개 항목 성공, ${unknown}개 확인 불가`:''}${current?.saved===false?' · 저장 실패':''} · SDP 상태와 별개입니다.`;
    }catch(e){message.textContent=`확인 불가 · ${e.message||'요청 실패'} · 표시된 이력은 이전 자료입니다.`;}
    finally{query.disabled=false;history.disabled=false;}
  }
  query.addEventListener('click',()=>load(true));history.addEventListener('click',()=>load(false));filter.addEventListener('change',render);
}

export function createSdpStatusView(root,request,{demo=false}={}){
  const add=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;root.append(n);return n;};
  add('p','SDP는 조직의 업무 서비스 연결 상태입니다. PC 조회 성공과 별개이며, 실제 연결 근거가 있어야 연결됨으로 표시합니다.');
  if(demo)add('p','예제 시나리오 · 실제 SDP 연결을 조회하거나 생성하지 않습니다.').className='tag tag-demo';
  const status=add('p','SDP 연결 확인 전');status.setAttribute('role','status');
  const button=add('button',demo?'예제 SDP 상태 보기':'SDP 상태 확인');button.type='button';button.className='btn';
  button.addEventListener('click',async()=>{
    button.disabled=true;status.textContent=demo?'예제 준비 중':'SDP 연결 확인 중';
    try{
      const r=await request('/api/pc-inspection/sdp'),d=r.data;
      const valid=r.ok&&d&&['connected','disconnected','unknown'].includes(d.status)&&typeof d.reason==='string'&&Number.isFinite(Date.parse(d.checkedAt));
      status.textContent=valid?`${demo?'예제 · ':''}${d.status==='connected'?'SDP 세션 연결 확인':d.status==='disconnected'?'SDP 미연결':'SDP 연결 확인 불가'} · ${d.reason} · ${demo?'예제 시각':'확인 시각'} ${time(d.checkedAt)}`:`SDP 연결 확인 불가 · ${r.error?.message||'응답 형식 오류'} · 연결 환경을 확인한 뒤 다시 조회하세요.`;
    }catch{status.textContent='SDP 연결 확인 불가 · 요청 실패. 연결 환경을 확인한 뒤 다시 조회하세요.';}
    finally{button.disabled=false;}
  });
}
