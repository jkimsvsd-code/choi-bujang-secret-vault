import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryView} from '../public/history-view.mjs';
class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.text='';this.value='';this.style={};this.open=false;}
  set textContent(v){this.text=String(v);this.children=[];}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ');}
  append(n){this.children.push(n);}
  appendChild(n){this.children.push(n);return n;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  removeAttribute(k){delete this.attrs[k];}
  addEventListener(k,f){this.listeners[k]=f;}
  replaceChildren(...nodes){this.children=nodes;this.text='';}
}
globalThis.document={createElement:tag=>new Node(tag)};

const walk=n=>[n,...n.children.flatMap(walk)];
const row=(queriedAt,kind='access')=>({queryId:'fixture-id',mode:'demo',kind,queriedAt,occurredAt:'2026-10-20T00:00:00Z'});
test('groups exact query timestamps newest first with filtered record counts',async()=>{
 const root=new Node('div');const view=createHistoryView(root,async()=>({ok:true,data:[row('2026-10-26T00:00:00Z'),row('2026-10-27T00:00:00Z'),row('2026-10-27T00:00:00Z','xdr')]}));
 const select=walk(root).find(n=>n.tagName==='select');select.value='all';await view.refresh();
 let summaries=walk(root).filter(n=>n.tagName==='summary');assert.match(summaries[0].textContent,/27.*기록 2건/);assert.match(summaries[1].textContent,/26.*기록 1건/);
 select.value='xdr';select.listeners.change();summaries=walk(root).filter(n=>n.tagName==='summary');assert.equal(summaries.length,2);assert.match(summaries[0].textContent,/기록 1건/);
});
test('failure remains failure after filter and deletion needs explicit confirmation',async()=>{
 const root=new Node('div');let fail=true;const calls=[];const view=createHistoryView(root,async(path)=>{calls.push(path);return fail?{ok:false}:{ok:true,data:[row('2026-10-27T00:00:00Z')]};});
 const select=walk(root).find(n=>n.tagName==='select');select.value='all';await view.refresh();select.listeners.change();assert.match(root.textContent,/이력 조회 실패/);
 const clear=walk(root).find(n=>n.tagName==='button'&&n.textContent.includes('삭제'));await clear.listeners.click();assert.equal(calls.length,1);
 fail=false;await view.refresh();const consent=walk(root).find(n=>n.tagName==='input');assert.equal(clear.disabled,true);consent.checked=true;consent.listeners.change();assert.equal(clear.disabled,false);
 fail=true;await clear.listeners.click();assert.match(root.textContent,/삭제 결과 확인 불가/);assert.equal(calls.at(-1),'/api/history/clear');
});
