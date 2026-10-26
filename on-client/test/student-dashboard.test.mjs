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
  replaceChildren(...nodes){this.children=nodes;this.text='';}
}
globalThis.document={createElement:tag=>new Node(tag)};
const idle={status:'idle',mode:'unknown'};
const walk=n=>[n,...n.children.flatMap(walk)];
const buttons=n=>walk(n).filter(x=>x.tagName==='button');
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
