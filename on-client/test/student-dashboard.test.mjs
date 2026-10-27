import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudentView} from '../student/extension.mjs';
class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.text='';this.value='';this.style={};this.open=false;}
  set textContent(v){this.text=String(v);this.children=[];}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ');}
  appendChild(n){this.children.push(n);return n;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  removeAttribute(k){delete this.attrs[k];}
  addEventListener(k,f){this.listeners[k]=f;}
  focus(){document.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  replaceChildren(...nodes){this.children=nodes;this.text='';}
}
globalThis.document={createElement:tag=>new Node(tag)};
const idle={status:'idle',mode:'unknown'};
const walk=n=>[n,...n.children.flatMap(walk)];
const buttons=n=>walk(n).filter(x=>x.tagName==='button'&&!x.attrs['data-guide-control']);
const setup=api=>{const view=createStudentView({api});return {view,root:view.renderIdentity({me:idle,devices:idle,sessions:idle})};};
test('three native keyboard buttons, safe waiting and failed item guidance without fallback',async()=>{
  let finish;const calls=[];const pending=new Promise(r=>finish=r);
  const {root}=setup({get:path=>{calls.push(path);return pending;}});
  const controls=buttons(root);assert.equal(controls.length,3);assert.ok(controls.every(b=>b.type==='button'));
  const action=controls[0].listeners.click();await Promise.resolve();
  assert.match(root.textContent,/조회 중/);assert.equal(controls[0].attrs['aria-disabled'],'true');
  await controls[0].listeners.click();assert.equal(calls.length,3);
  finish({ok:false,error:{code:'DENIED'}});await action;
  assert.match(root.textContent,/기기 조회 실패/);assert.match(root.textContent,/다시 조회하세요/);assert.doesNotMatch(root.textContent,/예제 자료/);
  assert.equal(controls[0].attrs['aria-disabled'],undefined);
});
test('malformed response fails visibly; demo data is explicitly identified',async()=>{
  const {root}=setup({get:async()=>({ok:true,meta:{mode:'demo',checkedAt:'2026-10-27T00:00:00Z'},data:{}})});
  await buttons(root)[1].listeners.click();
  assert.match(root.textContent,/예제 자료/);assert.match(root.textContent,/응답 형식 확인 불가/);
});
test('late request cannot overwrite newer host state',async()=>{
  let finish;const {view,root}=setup({get:()=>new Promise(r=>finish=r)});
  const action=buttons(root)[2].listeners.click();await Promise.resolve();
  view.renderVulnerabilities({status:'error',mode:'unknown',error:{message:'host failure'}});
  finish({ok:true,meta:{mode:'demo'},data:{status:'complete',packages:[]}});await action;
  assert.match(root.textContent,/설치 패키지·취약점 조회 실패/);assert.doesNotMatch(root.textContent,/예제 자료/);
});
test('timeline preserves event-time ordering and native kind filter',async()=>{
  const {root}=setup({get:async()=>({ok:true,meta:{mode:'demo'},data:[{kind:'access',summary:'older',at:'2026-10-26T00:00:00Z'},{kind:'xdr',summary:'newer',at:'2026-10-27T00:00:00Z'}]})});
  await buttons(root)[1].listeners.click();
  const select=walk(root).find(n=>n.tagName==='select');select.value='전체';select.listeners.change();
  assert.ok(root.textContent.indexOf('newer')<root.textContent.indexOf('older'));
  select.value='access';select.listeners.change();const timeline=walk(root).find(n=>n.attrs['aria-label']==='학생 핵심 보안 기록 타임라인');assert.doesNotMatch(timeline.textContent,/newer/);assert.match(timeline.textContent,/older/);
});

test('cards expose source, summary and time while detail stays collapsed after refresh',async()=>{
  const {root}=setup({get:async()=>({ok:true,meta:{mode:'demo',checkedAt:'2026-10-27T00:00:00Z'},data:[]})});
  assert.match(root.textContent,/내 보안 현황/);
  const card=walk(root).find(n=>n.attrs['aria-label']==='보안 기록');
  const details=card.children.find(n=>n.tagName==='details');assert.equal(details.open,false);
  await buttons(root)[1].listeners.click();assert.equal(details.open,false);
  const visible=card.children.filter(n=>n!==details).map(n=>n.textContent).join(' ');
  assert.match(visible,/조회된 기록 0건/);assert.match(visible,/예제 자료/);assert.match(visible,/원천 확인 시각/);assert.match(visible,/2026/);
  assert.equal(buttons(root)[1].attrs['aria-label'],'보안 기록 다시 조회');
});

test('each event owns collapsed details; extra filters are collapsed',()=>{
  const view=createStudentView();
  const event=id=>({id,kind:'access',summary:id,at:'2026-10-27T00:00:00Z',appId:'app',state:{access:'denied',session:'active',device:'unknown'},evidence:[],rules:[],supportedActions:[]});
  const root=view.renderEvents({status:'ok',mode:'demo',data:[event('a'),event('b')]});
  const selects=walk(root).filter(n=>n.tagName==='select');for(const select of selects)select.value='all';selects[0].listeners.change();
  const items=walk(root).filter(n=>n.attrs['data-student-event-id']);assert.equal(items.length,2);
  for(const item of items){const detail=item.children.find(n=>n.tagName==='details');assert.equal(detail.open,false);assert.match(detail.textContent,new RegExp(item.attrs['data-student-event-id']+' 상세'));}
  assert.ok(walk(root).find(n=>n.tagName==='summary'&&n.textContent.includes('추가 필터')));
});


test('first-use guidance and target labels survive waiting, completion, failure and host sync',async()=>{
  let finish;
  const {view,root}=setup({get:()=>new Promise(resolve=>{finish=resolve;})});
  const controls=buttons(root);
  const labels=['기기·세션 다시 조회','보안 기록 다시 조회','패키지 다시 조회'];
  assert.deepEqual(controls.map(b=>b.textContent),labels);
  assert.deepEqual(controls.map(b=>b.attrs['aria-label']),labels);
  assert.match(view.renderGuide().textContent,/케셰브는 내 PC 상태와 연결된 서비스의 보안 기록을 확인하는 앱/);
  assert.match(view.renderGuide().textContent,/처음이라면 ‘내 PC 상태 측정’/);
  assert.match(view.renderGuide().textContent,/예제 기록과 SDP 연결 상태는 별도/);
  const success=controls[1].listeners.click();await Promise.resolve();
  assert.equal(controls[1].textContent,'보안 기록 조회 중…');
  finish({ok:true,meta:{mode:'demo'},data:[]});await success;
  assert.equal(controls[1].textContent,labels[1]);
  const failure=controls[2].listeners.click();await Promise.resolve();
  assert.equal(controls[2].textContent,'패키지 조회 중…');
  finish({ok:false,error:{code:'DENIED'}});await failure;
  assert.equal(controls[2].textContent,labels[2]);
  view.renderVulnerabilities({status:'error',mode:'unknown',error:{message:'host failure'}});
  assert.deepEqual(controls.map(b=>b.textContent),labels);
});

test('current response explains its relationship to saved query history',()=>{
  const root=createStudentView().renderEvents({status:'ok',mode:'demo',data:[]});
  assert.match(root.textContent,/이번 응답만 사건 발생 시각 최신순/);
  assert.match(root.textContent,/이전 조회의 시각·종류·출처는 아래 ‘내가 조회한 이력’/);
  assert.match(root.textContent,/조회 시각은 내가 기록을 불러온 때/);
  assert.match(root.textContent,/사건 원문을 보관하지 않습니다/);
  assert.doesNotMatch(root.textContent,/과거 조회 이력을 누적 저장하지 않습니다/);
});


test('tab purpose stays visible before queries, while loading and after failures',()=>{
  const view=createStudentView();
  for(const status of ['idle','loading','error']){
    const resource={status,mode:'unknown',error:{message:'test failure'}};
    const protection=view.renderIdentity({me:resource,devices:resource,sessions:resource});
    assert.match(view.renderGuide().textContent,/보호 현황에서는 내 PC와 서비스의 최근 확인 상태/);
    assert.match(view.renderGuide().textContent,/실시간 보호나 안전을 보장하는 판정은 아닙니다/);
    assert.match(view.renderGuide().textContent,/현재 상태는 보호 현황, 업무 접속은 업무 앱, 사건과 조회 이력은 보안 기록/);
    const apps=view.renderDecision(resource);
    assert.match(apps.children[0].textContent,/업무 앱에서는 사용할 앱을 선택해 접속 가능 여부/);
    assert.match(apps.textContent,/접속 허용은 실제 서비스 연결 완료와 다를 수 있습니다/);
    const records=view.renderEvents(resource);
    assert.match(records.children[0].textContent,/보안 기록에서는 받아 온 사건·접속 기록과 이전 조회 이력/);
    assert.match(records.textContent,/기록 건수는 공격 확정 건수가 아닙니다/);
    if(status==='idle'){
      assert.match(apps.textContent,/앱을 골라 접속을 요청하세요/);
      assert.match(records.textContent,/기록 조회 전/);
    }else if(status==='loading'){
      assert.match(protection.textContent,/조회 대기 중/);
      assert.match(apps.textContent,/판정 확인 중/);
      assert.match(records.textContent,/기록을 불러오는 중/);
    }else{
      assert.match(protection.textContent,/로그인 조회 실패/);
      assert.match(apps.textContent,/요청 실패는 접근 거부 판정이 아닙니다/);
      assert.match(records.textContent,/기록을 불러오지 못했습니다/);
    }
  }
  const denied=view.renderDecision({status:'ok',mode:'demo',data:{decision:'deny',reason:'test reason'}});
  assert.match(denied.textContent,/업무 앱에서는/);
  assert.match(denied.textContent,/접근 거부/);
  const invalid=view.renderEvents({status:'error',error:{code:'CONTRACT_MISMATCH'}});
  assert.match(invalid.textContent,/보안 기록에서는/);
  assert.match(invalid.textContent,/CONTRACT_MISMATCH/);
});


test('automatic onboarding persists dismissal without a help button; guide remains available',async()=>{
  const previous=globalThis.localStorage;const values=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});
  try{
    const mount=async()=>{const result=setup();result.dashboard=walk(result.root).find(n=>n.attrs['data-student-dashboard']);result.dashboard.isConnected=true;document.activeElement=null;await Promise.resolve();return result;};
    const first=await mount(),dialog=walk(first.root).find(n=>n.tagName==='dialog');
    const checkbox=walk(dialog).find(n=>n.tagName==='input'),dismiss=walk(dialog).find(n=>n.tagName==='button');
    assert.equal(dialog.open,true);assert.equal(document.activeElement,dismiss);
    assert.equal(walk(first.root).some(n=>n.tagName==='button'&&n.text==='사용 안내'),false);
    assert.equal(first.dashboard.children.filter(n=>n.tagName==='p').some(n=>n.textContent.includes('케셰브는')),false);
    checkbox.checked=true;dismiss.listeners.click();assert.equal(dialog.open,false);assert.equal(document.activeElement,first.dashboard);
    const second=await mount();assert.equal(walk(second.root).find(n=>n.tagName==='dialog').open,false);
    assert.match(second.view.renderGuide().textContent,/케셰브는 내 PC 상태/);
    assert.match(second.view.renderGuide().textContent,/현재 상태는 보호 현황/);
    values.clear();const third=await mount();const thirdDialog=walk(third.root).find(n=>n.tagName==='dialog');
    let prevented=false;thirdDialog.listeners.cancel({preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(thirdDialog.open,false);assert.equal(values.size,0);
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked');}});
    const fourth=await mount();const fourthDialog=walk(fourth.root).find(n=>n.tagName==='dialog');
    walk(fourthDialog).find(n=>n.tagName==='button').listeners.click();
    assert.match(fourth.root.textContent,/선택을 저장하지 못했습니다/);
    assert.equal(fourthDialog.open,false);
  }finally{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:previous});}
});


test('start only requests navigation, Escape does not, and guide has ordered sections',async()=>{
  let moves=0,requests=0;
  const mount=async()=>{const result=setup({focusPcMeasurement(){moves++;return true;},get(){requests++;throw Error('unexpected query');}});walk(result.root).find(n=>n.attrs['data-student-dashboard']).isConnected=true;await Promise.resolve();return result;};
  const first=await mount();const dialog=walk(first.root).find(n=>n.tagName==='dialog');
  walk(dialog).find(n=>n.tagName==='button').listeners.click();
  assert.equal(moves,1);assert.equal(requests,0);assert.equal(dialog.open,false);
  const second=await mount();const other=walk(second.root).find(n=>n.tagName==='dialog');
  other.listeners.cancel({preventDefault(){}});
  assert.equal(moves,1);assert.equal(requests,0);assert.equal(other.open,false);
  assert.deepEqual(walk(first.view.renderGuide()).filter(n=>n.tagName==='h2').map(n=>n.textContent),['앱 목적','처음 할 일','탭별 역할','결과 읽는 법']);
});
