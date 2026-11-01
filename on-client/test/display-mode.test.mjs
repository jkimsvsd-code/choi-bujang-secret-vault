import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDisplayMode, createDemoData } from '../public/demo-data.mjs';
import { renderAvailability } from '../public/availability-view.mjs';
import { createHistoryView } from '../public/history-view.mjs';
import { createOnServer } from '../src/server.mjs';
import { demoEngine } from '../src/engine.mjs';

const clock=()=>new Date('2026-11-01T00:00:00.000Z');
const actualOk={ok:true,data:[],meta:{mode:'connected',checkedAt:clock().toISOString()}};

test('demo screens never call the real transport, including unknown routes and approvals',async()=>{
  let calls=0;const mode=createDisplayMode({clock,actualRequest:async()=>{calls++;return actualOk;}});
  mode.setMode('demo');
  for(const path of ['/api/me','/api/devices','/api/sessions','/api/apps','/api/events','/api/history','/api/pc-status/history','/api/pc-inspection/history','/api/pc-inspection/sdp','/api/vulnerabilities','/api/diagnostics']){
    const result=await mode.request(path);assert.equal(result.ok,true,path);assert.equal(result.meta.mode,'demo');
  }
  for(const path of ['/api/pc-status','/api/pc-inspection','/api/ai/check','/api/native-login/start','/api/ai/connect/start'])assert.equal((await mode.request(path,{method:'POST',body:{}})).ok,true,path);
  assert.equal((await mode.request('/api/not-a-demo',{method:'POST'})).ok,false);
  assert.equal(calls,0);
});

test('actual failures never fall back to samples; mislabeled demo replies are rejected',async()=>{
  const error={ok:false,error:{code:'DENIED',message:'not available'},meta:{mode:'disconnected'}};
  const mode=createDisplayMode({clock,actualRequest:async()=>error});
  assert.deepEqual(await mode.request('/api/me'),error);
  for(const result of [{...actualOk,meta:{mode:'demo'}},{...actualOk,data:{source:'example'}},{...actualOk,data:[{mode:'demo'}]}]){
    const boundary=createDisplayMode({actualRequest:async()=>result});
    const reply=await boundary.request('/api/history');
    assert.equal(reply.error.code,'REAL_SOURCE_UNAVAILABLE');assert.doesNotMatch(reply.error.message,/예제|데모|demo/i);assert.match(reply.error.message,/확인 불가/);
  }
});

test('mode change cancels ignored-signal responses and prevents old views issuing new requests',async()=>{
  let release,calls=0;const pending=new Promise(resolve=>{release=resolve;});
  const mode=createDisplayMode({clock,actualRequest:()=>{calls++;return pending;}});
  const old=mode.bindRequest(),request=old('/api/me');await Promise.resolve();
  mode.setMode('demo');assert.equal((await request).error.code,'CANCELLED');
  release(actualOk);await Promise.resolve();
  assert.equal((await old('/api/history')).error.code,'CANCELLED');assert.equal(calls,1);
  const demoView=mode.bindRequest();mode.setMode('actual');
  assert.equal((await demoView('/api/pc-status',{method:'POST'})).error.code,'CANCELLED');assert.equal(calls,1);
});

test('display mode is per instance and a pre-cancelled request performs no work',async()=>{
  let calls=0;const actualRequest=async()=>{calls++;return actualOk;};
  const one=createDisplayMode({actualRequest}),two=createDisplayMode({actualRequest});one.setMode('demo');
  assert.equal(two.mode,'actual');await two.request('/api/me');assert.equal(calls,1);
  const controller=new AbortController();controller.abort();
  assert.equal((await two.request('/api/me',{signal:controller.signal})).error.code,'CANCELLED');assert.equal(calls,1);
});

test('native transport keeps original HTTP/body contracts and is never called in demo',async()=>{
  let calls=0;const mode=createDisplayMode({actualRequest:async()=>actualOk});
  const body={ok:false,error:{code:'NATIVE_HOST_EXPIRED'},meta:{mode:'connected',checkedAt:clock().toISOString(),starterVersion:'0.1.0'}};
  const native=mode.guardActualFetch(async()=>{calls++;return new Response(JSON.stringify(body),{status:410,headers:{'content-type':'application/json'}});});
  const response=await native('/api/native-login/current',{});assert.equal(response.status,410);assert.deepEqual(await response.json(),body);
  mode.setMode('demo');assert.equal((await native('/api/native-login/start',{})).ok,false);assert.equal(calls,1);
});

test('late native response is discarded on mode change, even if the transport ignores abort',async()=>{
  let finish;const mode=createDisplayMode({actualRequest:async()=>actualOk});
  const native=mode.guardActualFetch(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=native('/api/native-login/current',{});mode.setMode('demo');
  finish(new Response(JSON.stringify({ok:true,data:{state:'connected'}})));
  const result=await pending;assert.equal(result.ok,false);assert.equal((await result.json()).error.code,'CANCELLED');
});

test('example PC values have units and times, and copies cannot mutate subsequent results',async()=>{
  const request=createDemoData({clock}),result=await request('/api/pc-status/history');
  assert.ok(result.data.length>1);
  for(const sample of result.data){assert.equal(sample.source,'example');for(const metric of sample.metrics){assert.ok(['%','GiB'].includes(metric.unit));assert.ok(Number.isFinite(Date.parse(metric.measuredAt)));}}
  result.data[0].source='measured';assert.equal((await request('/api/pc-status/history')).data[0].source,'example');
  assert.equal((await request('/api/pc-inspection/sdp')).data.status,'disconnected');
});

test('demo history deletion needs a current query id and never changes the actual store',async()=>{
  let calls=0;const mode=createDisplayMode({clock,actualRequest:async()=>{calls++;return actualOk;}});mode.setMode('demo');
  const rows=(await mode.request('/api/history')).data;
  assert.equal((await mode.request('/api/history/clear',{method:'POST',body:{queryId:'wrong'}})).ok,false);
  assert.equal((await mode.request('/api/history')).data.length,rows.length);
  assert.equal((await mode.request('/api/history/clear',{method:'POST',body:{queryId:rows[0].queryId}})).ok,true);
  assert.deepEqual((await mode.request('/api/history')).data,[]);assert.equal(calls,0);
});

test('example action keeps prepare, confirmation and result observation separate',async()=>{
  const request=createDemoData({clock});
  assert.equal((await request('/api/actions/execute',{method:'POST',body:{}})).ok,false);
  const prepared=(await request('/api/actions/prepare',{method:'POST',body:{eventId:'example-access',actionId:'revoke-session'}})).data;
  assert.equal(prepared.status,'prepared');
  const body={requestId:prepared.requestId,confirmationId:prepared.confirmationId};
  assert.equal((await request('/api/actions/execute',{method:'POST',body})).data.status,'pending');
  assert.equal((await request('/api/actions/result',{method:'POST',body:{requestId:body.requestId}})).data.status,'succeeded');
});

class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.text='';this.value='';this.open=false;}
  set textContent(value){this.text=String(value);this.children=[];} get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
  append(node){this.children.push(node);} appendChild(node){this.append(node);return node;} setAttribute(key,value){this.attrs[key]=String(value);} addEventListener(key,fn){this.listeners[key]=fn;} replaceChildren(...nodes){this.children=nodes;this.text='';}
}
const walk=node=>[node,...node.children.flatMap(walk)];

test('one collapsed history table sorts all rows, preserves expansion and requires deletion confirmation',async()=>{
  const prior=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  try{
    const request=createDemoData({clock}),root=new Element('div'),calls=[];
    const view=createHistoryView(root,async(path,options)=>{calls.push(path);return request(path,options);},{demo:true});
    const filter=walk(root).find(n=>n.tagName==='select');filter.value='all';await view.refresh();
    assert.equal(walk(root).filter(n=>n.tagName==='table').length,1);
    const disclosure=walk(root).find(n=>n.className==='history-disclosure');assert.equal(disclosure.open,false);
    const body=walk(root).find(n=>n.tagName==='tbody');assert.equal(body.children.length,4);
    assert.match(body.children[0].children[0].textContent,/8(?:시 |:)50/);assert.match(body.children.at(-1).children[0].textContent,/8(?:시 |:)40/);
    disclosure.open=true;filter.value='xdr';filter.listeners.change();assert.equal(body.children.length,2);await view.refresh();assert.equal(disclosure.open,true);
    const clear=walk(root).find(n=>n.tagName==='button'&&n.text.includes('삭제')),consent=walk(root).find(n=>n.tagName==='input');
    await clear.listeners.click();assert.ok(!calls.includes('/api/history/clear'));
    consent.checked=true;consent.listeners.change();assert.equal(clear.disabled,false);await clear.listeners.click();
    assert.ok(calls.includes('/api/history/clear'));assert.equal(consent.checked,false);assert.match(root.textContent,/보관된 기록 없음/);
  }finally{globalThis.document=prior;}
});

test('actual history rejects example rows and failure cannot become empty-success through filtering',async()=>{
  const prior=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  try{
    const root=new Element('div'),view=createHistoryView(root,createDemoData({clock}));await view.refresh();
    assert.match(root.textContent,/이력 조회 실패/);const filter=walk(root).find(n=>n.tagName==='select');filter.value='xdr';filter.listeners.change();assert.match(root.textContent,/이력 조회 실패/);
  }finally{globalThis.document=prior;}
});

test('server refuses demo engine data in actual mode before reads/writes, while PC reads remain separate',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'keshev-display-test-'));
  let reads=0;const original=demoEngine(),engine={...original,readIdentity:async()=>{reads++;return original.readIdentity();}};
  const server=createOnServer({engine,historyDirectory:directory,clock,aiEnv:{}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const path of ['/api/me','/api/events','/api/history']){
      const result=await (await fetch(base+path,{headers:{'x-keshev-display-mode':'actual'}})).json();
      assert.equal(result.ok,false);assert.equal(result.error.code,'REAL_SOURCE_UNAVAILABLE');assert.equal(result.meta.mode,'disconnected');assert.doesNotMatch(result.error.message,/예제|데모|demo/i);
    }
    assert.equal(reads,0);
    const diagnostics=await (await fetch(base+'/api/diagnostics',{headers:{'x-keshev-display-mode':'actual'}})).json();
    assert.equal(diagnostics.data.engine.mode,'disconnected');assert.equal(diagnostics.data.engine.code,'REAL_SOURCE_UNAVAILABLE');
    const sdp=await (await fetch(base+'/api/pc-inspection/sdp',{headers:{'x-keshev-display-mode':'actual'}})).json();assert.equal(sdp.data.status,'disconnected');
    assert.equal((await fetch(base+'/demo-data.mjs')).status,200);
    assert.equal((await (await fetch(base+'/api/me')).json()).meta.mode,'demo');assert.equal(reads,1);
    const denied=await fetch(base+'/api/history/clear',{method:'POST',headers:{origin:base,'content-type':'application/json','x-keshev-display-mode':'actual'},body:JSON.stringify({queryId:'example-query'})});assert.equal(denied.status,503);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});


test('availability remains a table in both modes and only demo mode explains examples',()=>{
  const prior=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  try{
    const root=new Element('div');
    renderAvailability(root,{me:{status:'error',meta:{mode:'disconnected'}}},{demo:false});
    assert.doesNotMatch(root.textContent,/예제|데모|demo/i);
    assert.match(root.textContent,/확인 불가/);assert.match(root.textContent,/PC 조회 성공과 별개/);
    assert.equal(walk(root).filter(node=>node.tagName==='table').length,1);
    renderAvailability(root,{me:{status:'ok',meta:{mode:'demo',checkedAt:clock().toISOString()}}},{demo:true});
    assert.match(root.textContent,/설명용 예제/);assert.match(root.textContent,/실제 조회·AI 호출·조치를 수행하지 않습니다/);
    assert.equal(walk(root).filter(node=>node.tagName==='table').length,1);
  }finally{globalThis.document=prior;}
});
