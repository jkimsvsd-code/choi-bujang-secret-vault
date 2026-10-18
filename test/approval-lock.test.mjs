import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function harness({ceremony,status}={}){
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 let script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
 script=script.slice(0,script.lastIndexOf('    try {')).replace(/^    import .*;$/m,'');
 const nodes=new Map();
 function element(){return {value:'stale protected text',textContent:'',hidden:false,children:[],addEventListener(){},setAttribute(){},querySelectorAll(){return [];},reset(){},replaceChildren(...v){this.children=v;},append(...v){this.children.push(...v);}};}
 const document={addEventListener(){},querySelector(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element};
 const calls=[];
 const api=vm.runInNewContext(script+';({renderSession,loadNotes,writeNote,checkDevice,invalidateApproval})',{
 document,AbortController,window:{addEventListener(){}},clearTimeout(){},setTimeout(){return 1;},
 runDeviceCeremony:ceremony??(async()=>({status:'pending'})),deviceRequest:status??(async()=>({status:'approved'})),
 async fetch(path,options){calls.push({path,options});return {ok:true,status:200,json:async()=>[{id:'fixture',title:'fixture-title',body:'fixture-body'}]};}});
 return {api,nodes,calls};
}
const session={access_token:'fixture',user:{id:'fixture'},approved:true,deviceRegistered:true};
test('login/forged approval fields/pending registration never request protected resources',async()=>{
 const {api,nodes,calls}=harness();
 for(const value of [null,session]){
   api.renderSession(value);await api.loadNotes(value);await api.writeNote('POST',null,{title:'fixture',body:'fixture'});await api.writeNote('DELETE','fixture');
   assert.equal(nodes.get('#note-editor').hidden,true);assert.equal(nodes.get('#note-title').value,'');assert.equal(nodes.get('#note-body').value,'');
   assert.match(nodes.get('#notes').children[0].textContent,/승인 확인 전/);
 }
 await api.checkDevice(true);assert.equal(calls.length,0);assert.match(nodes.get('#device-status').textContent,/승인 대기/);
});
test('server-confirmed grant opens original UI; invalidation clears it; late approval cannot reopen logged-out UI',async()=>{
 const result={status:'approved',grant:'a'.repeat(43),expiresAt:Date.now()+300000};
 const {api,nodes,calls}=harness({ceremony:async()=>result});api.renderSession(session);await api.checkDevice(false);
 assert.equal(nodes.get('#note-editor').hidden,false);assert.equal(calls.length,1);assert.equal(calls[0].options.headers['X-Device-Grant'],result.grant);assert.equal(nodes.get('#notes').children[0].children[0].textContent,'fixture-title');
 api.invalidateApproval();assert.equal(nodes.get('#note-editor').hidden,true);assert.equal(nodes.get('#note-title').value,'');
 let resolve;const late=harness({ceremony:()=>new Promise(r=>{resolve=r;})});late.api.renderSession(session);const pending=late.api.checkDevice(false);late.api.renderSession(null);resolve(result);await pending;assert.equal(late.calls.length,0);assert.equal(late.nodes.get('#note-editor').hidden,true);
});
test('approval-shaped response without server status confirmation leaves UI locked',async()=>{
 const h=harness({ceremony:async()=>({status:'approved',grant:'a'.repeat(43),expiresAt:Date.now()+300000}),status:async()=>{throw Error('device_not_approved');}});h.api.renderSession(session);await h.api.checkDevice(false);assert.equal(h.calls.length,0);assert.equal(h.nodes.get('#note-editor').hidden,true);
});
