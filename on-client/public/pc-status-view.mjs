const labels={cpu:'CPU 사용률',memory:'메모리 사용량',disk:'디스크 남은 공간'};
const time=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':'확인 불가';
export function explainChange(current, metric, history) {
  if(current.source!=='measured')return '예제 값은 실측과 비교하지 않습니다.';
  if(metric.status!=='ok'||!Number.isFinite(metric.value))return '확인 불가 · 이번 값이 없어 비교하지 않습니다.';
  const candidates=history.filter(row=>row.source==='measured'&&Date.parse(row.queriedAt)<Date.parse(current.queriedAt))
    .sort((a,b)=>Date.parse(b.queriedAt)-Date.parse(a.queriedAt));
  for(const row of candidates){
    const previous=row.metrics?.find(m=>m.kind===metric.kind&&m.status==='ok'&&m.unit===metric.unit&&m.target===metric.target&&Number.isFinite(m.value)&&Number.isFinite(Date.parse(m.measuredAt)));
    if(!previous)continue;
    const delta=metric.value-previous.value;
    return `직전 유효 실측(${time(previous.measuredAt)}) 대비 ${delta>0?'+':''}${delta.toFixed(2)} ${metric.kind==='cpu'?'%p':'GiB'}. 변화 원인은 이 값만으로 판단할 수 없습니다.`;
  }
  return '비교 자료 부족 · 같은 대상의 이전 유효 실측이 없습니다.';
}
export function createPcStatusView(root, request) {
  let rows=[],busy=false,sequence=0;
  const add=(parent,tag,text)=>{const element=document.createElement(tag);element.textContent=text;parent.append(element);return element;};
  add(root,'p','학생 추가 기능: 로컬 서버가 실행되는 이 PC를 일반 권한으로 측정합니다. 앱이 demo여도 아래 값은 별도의 실측이며 예제 보안 기록과 섞지 않습니다. 제공 기기 보안 상태와는 다른 정보입니다.');
  const help=add(root,'details','');help.className='pc-help';
  add(help,'summary','측정 기준과 단위 보기');
  add(help,'p','CPU는 약 1초 구간의 논리 CPU 시간 평균, 메모리는 전체 물리 메모리−여유 메모리, 디스크는 사용자 홈 드라이브의 사용 가능 공간입니다. GiB = 1,073,741,824바이트. 과거 기록은 현재 상태가 아닙니다.');
  const controls=add(root,'div','');controls.className='pc-controls';
  const measure=add(controls,'button','내 PC 상태 측정');measure.type='button';measure.className='btn pc-measure';
  const reload=add(controls,'button','PC 측정 이력 조회');reload.type='button';reload.className='btn';
  const filterLabel=add(controls,'label','표시 항목 ');
  const filter=add(filterLabel,'select','');filter.setAttribute('aria-label','PC 상태 종류');
  for(const [value,label] of [['all','전체'],...Object.entries(labels)]){const option=add(filter,'option',label);option.value=value;}
  const status=add(root,'p','측정 전 · 자동으로 측정하지 않습니다.');status.setAttribute('role','status');
  status.className='pc-status-message';
  const latest=add(root,'section','');latest.setAttribute('aria-label','최신 조회 요약');
  const historyHeading=add(root,'h3','항목별 측정 이력');historyHeading.className='pc-history-heading';
  const list=add(root,'ol','');list.setAttribute('aria-label','항목별 측정 이력');
  list.className='pc-history-groups';
  const valid=sample=>sample&&['measured','example'].includes(sample.source)&&Number.isFinite(Date.parse(sample.queriedAt))&&Array.isArray(sample.metrics)&&sample.metrics.every(m=>Object.hasOwn(labels,m.kind)&&['ok','unknown'].includes(m.status)&&m.unit===(m.kind==='cpu'?'%':'GiB')&&typeof m.target==='string'&&(m.status!=='ok'||Number.isFinite(m.value)&&Number.isFinite(Date.parse(m.measuredAt))));
  const renderTrend=(parent,current,metric)=>{
    const figure=add(parent,'figure','');figure.className='pc-trend';
    add(figure,'figcaption',`최근 최대 20회 ${current.source==='measured'?'실측':'예제'} 추이 · ${metric.unit}`);
    const samples=rows.filter(row=>row.source===current.source&&Date.parse(row.queriedAt)<=Date.parse(current.queriedAt))
      .sort((a,b)=>Date.parse(b.queriedAt)-Date.parse(a.queriedAt)).slice(0,20).reverse().map(row=>{
        const m=row.metrics.find(m=>m.kind===metric.kind&&m.target===metric.target&&m.unit===metric.unit);
        return {value:m?.status==='ok'&&Number.isFinite(m.value)?m.value:null,at:m?.measuredAt||m?.attemptedAt||row.queriedAt};
      });
    const values=samples.filter(point=>point.value!==null);
    if(!values.length){add(figure,'p','확인 불가 · 그래프에 표시할 유효 값이 없습니다.');return;}
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 300 170');svg.setAttribute('role','img');
    svg.setAttribute('aria-label',`${labels[metric.kind]} ${values.length}개 유효 값 추이. 가로축 측정 시각 KST, 세로축 ${metric.unit}. 실패 구간은 연결하지 않습니다.`);figure.append(svg);
    const draw=(tag,attrs,text)=>{const node=document.createElementNS(svg.namespaceURI,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;svg.append(node);return node;};
    const upper=metric.kind==='cpu'?100:Math.max(1,...values.map(point=>point.value))*1.1;
    const first=Math.min(...samples.map(point=>Date.parse(point.at))),last=Math.max(...samples.map(point=>Date.parse(point.at)));
    const x=point=>last===first?165:44+(Date.parse(point.at)-first)/(last-first)*242;
    const y=value=>126-value/upper*102;
    for(const value of [0,upper/2,upper]){
      draw('line',{x1:44,x2:286,y1:y(value),y2:y(value),class:'pc-chart-grid'});
      draw('text',{x:39,y:y(value)+4,'text-anchor':'end',class:'pc-chart-label'},value.toFixed(metric.kind==='cpu'?0:1));
    }
    let segment=[];
    const flush=()=>{if(segment.length>1)draw('polyline',{points:segment.join(' '),class:'pc-chart-line'});segment=[];};
    for(const point of samples){
      if(point.value===null){flush();draw('text',{x:x(point),y:122,'text-anchor':'middle',class:'pc-chart-gap'},'×');continue;}
      segment.push(`${x(point)},${y(point.value)}`);
      const dot=draw('circle',{cx:x(point),cy:y(point.value),r:3,class:'pc-chart-dot'});
      const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=`${time(point.at)} · ${point.value.toFixed(2)} ${metric.unit}`;dot.append(title);
    }
    flush();
    const short=value=>new Date(value).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
    draw('text',{x:44,y:145,class:'pc-chart-label'},short(first));
    draw('text',{x:286,y:160,'text-anchor':'end',class:'pc-chart-label'},short(last));
    add(figure,'p',`${time(new Date(first).toISOString())} → ${time(new Date(last).toISOString())} · 유효 ${values.length}/${samples.length}회. ×는 확인 불가 또는 비교 대상 불일치${values.length===1?' · 한 점만 있어 추세 판단 불가':''}.`).className='pc-meta';
  };
  const renderTable=(parent,kind)=>{
    const entries=rows.map(row=>{
      const metric=row.metrics.find(m=>m.kind===kind);
      const at=metric?.status==='ok'?metric.measuredAt:metric?.attemptedAt;
      return {row,metric,at:Number.isFinite(Date.parse(at))?at:row.queriedAt,fallback:!Number.isFinite(Date.parse(at))};
    }).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||Date.parse(b.row.queriedAt)-Date.parse(a.row.queriedAt));
    const wrap=add(parent,'div','');wrap.className='pc-table-wrap';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',`${labels[kind]} 시간대별 표`);
    const table=add(wrap,'table','');table.className='pc-history-table';
    add(table,'caption',`${labels[kind]} · 최신 기록 포함 · 측정 시각 내림차순 (실패는 시도 시각, 시각 누락은 조회 시각 기준)`);
    const header=add(add(table,'thead',''),'tr','');
    for(const label of ['측정 / 시도 시각','수치','단위','대상 / 조회 시각 / 구간','직전 유효 실측 대비','출처 / 상태 / 실패 이유'])add(header,'th',label).scope='col';
    const body=add(table,'tbody','');
    for(const {row,metric,at,fallback} of entries){
      const ok=metric?.status==='ok';
      const tr=add(body,'tr','');add(tr,'th',`${fallback?'조회 (측정·시도 시각 없음)':ok?'측정':'시도'} ${time(at)}`).scope='row';
      add(tr,'td',ok?metric.value.toFixed(2):'확인 불가');
      add(tr,'td',metric?.unit||(kind==='cpu'?'%':'GiB'));
      add(tr,'td',`${metric?.target||'대상 확인 불가'} · 조회 ${time(row.queriedAt)}${ok&&kind==='cpu'?` · 시작 ${time(metric.startedAt)} · ${(metric.intervalMs/1000).toFixed(3)}초`:''}`);
      add(tr,'td',metric?explainChange(row,metric,rows):'확인 불가 · 항목 누락');
      add(tr,'td',`${row.source==='measured'?'실측':'예제 (설명용)'} · ${ok?'읽기 성공':`확인 불가 · ${metric?.reason||'항목을 읽지 못했습니다.'}`}${row.saved===false?' · 저장 실패: 이번 화면에서만 확인 가능':''}`).className=ok&&row.saved!==false?'':'pc-warning';
    }
  };
  const render=()=>{
    const opened=new Set([...list.querySelectorAll('details[open]')].map(node=>node.dataset.metricKind));
    latest.replaceChildren();
    list.replaceChildren();
    const ordered=[...rows].sort((a,b)=>Date.parse(b.queriedAt)-Date.parse(a.queriedAt));
    historyHeading.textContent=`항목별 측정 이력 · 최신 포함 ${ordered.length}회`;
    if(!ordered.length){add(latest,'p','표시할 측정 자료가 없습니다. 내 PC 상태 측정을 눌러 시작하세요.');return;}
    const renderMetrics=(parent,row)=>{
      if(row.saved===false)add(parent,'p','저장 실패 · 이번 화면에서만 확인할 수 있습니다.').className='pc-warning';
      const grid=add(parent,'div','');grid.className='pc-metric-grid';
      for(const metric of row.metrics.filter(m=>filter.value==='all'||m.kind===filter.value)){
        const card=add(grid,'article','');card.className=`pc-metric${metric.status==='ok'?'':' pc-unknown'}`;
        add(card,'h4',labels[metric.kind]);
        const value=add(card,'p',metric.status==='ok'?metric.value.toFixed(2):'확인 불가');value.className='pc-value';
        add(value,'span',` ${metric.unit}`).className='pc-unit';
        add(card,'p',metric.status==='ok'?`측정 시각 ${time(metric.measuredAt)}`:`측정 시각 없음 · 시도 ${time(metric.attemptedAt)}`).className='pc-time';
        if(metric.status!=='ok')add(card,'p',`이유: ${metric.reason||'원인 정보 없음'}`).className='pc-warning';
        renderTrend(card,row,metric);
        add(card,'p',explainChange(row,metric,rows)).className='pc-change';
        add(card,'p',`대상: ${metric.target}`).className='pc-meta';
        if(metric.kind==='cpu'&&metric.status==='ok')add(card,'p',`측정 시작 ${time(metric.startedAt)} · 구간 ${(metric.intervalMs/1000).toFixed(3)}초`).className='pc-meta';
      }
    };
    const row=ordered[0];
    const heading=add(latest,'h3','최신 조회 요약 ');add(heading,'span',row.source==='measured'?'실측':'예제').className='pc-source';
    add(latest,'p',`조회 시각 ${time(row.queriedAt)} · 해당 시점의 값입니다.`).className='pc-time';
    renderMetrics(latest,row);
    for(const [kind,label] of Object.entries(labels)){
      const item=add(list,'li',''),details=add(item,'details','');details.dataset.metricKind=kind;details.open=opened.has(kind);
      add(details,'summary',`${label} · ${rows.length}건 · 최신순`);
      renderTable(details,kind);
    }
  };
  filter.addEventListener('change',render);
  async function load(measuring){
    if(busy)return;busy=true;measure.disabled=true;reload.disabled=true;const gen=++sequence;
    status.textContent=measuring?'일반 권한으로 측정 중':'저장된 PC 이력 조회 중';
    try{
      let current;
      if(measuring){
        const result=await request('/api/pc-status',{method:'POST',body:{}});
        if(!result.ok||!valid(result.data)){status.textContent=`확인 불가 · ${result.error?.message||'측정 응답 형식 오류'}. 아래는 이전 조회 자료입니다.`;return;}
        current=result.data;
      }
      const result=await request('/api/pc-status/history');if(gen!==sequence)return;
      if(!result.ok||!Array.isArray(result.data)||!result.data.every(valid)){
        rows=current?[current]:[];render();status.textContent='이력 확인 불가 · 이전 비교값을 읽지 못했습니다. 자동 재시도하지 않습니다.';return;
      }
      rows=result.data;
      if(current&&!rows.some(row=>row.queriedAt===current.queriedAt))rows.unshift(current);
      render();status.textContent=`조회된 측정 묶음 ${rows.length}건 · 최근 30일, 최대 1,000묶음${current?.saved===false?' · 이번 측정 저장 실패':''}`;
    }finally{busy=false;measure.disabled=false;reload.disabled=false;}
  }
  measure.addEventListener('click',()=>load(true));reload.addEventListener('click',()=>load(false));
}
