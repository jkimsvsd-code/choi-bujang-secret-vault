import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPcInspector,validInspection} from '../src/pc-inspection.mjs';
import {createHistoryStore} from '../src/history/store.mjs';
import {createOnServer} from '../src/server.mjs';

// Synthetic inputs, not measurements from a PC or attack simulations.
const clock=()=>new Date('2026-10-27T00:00:00Z');
const read=async kind=>({ok:true,rows:kind==='network'?[{label:'fixture IPv4',value:'192.0.2.1',unit:'주소'}]:kind==='firewall'?
  Array.from({length:9},(_,i)=>({label:`fixture ${i}`,value:'NotConfigured',unit:'정책'})):
  [{label:'경고 (Level 3)',value:'0',unit:'건'},{label:'오류 (Level 2)',value:'2',unit:'건'}]});
const inspector=overrides=>createPcInspector({read,clock,platform:'win32',...overrides});
test('fixed 24-hour window, numeric counts and independent permission failures',async()=>{
  const calls=[];
  const r=await inspector({read:async(k,opts)=>{calls.push(opts);return k==='firewall'?{ok:false,code:'DENIED'}:read(k);}})();
  assert.equal(validInspection(r),true);assert.equal(Date.parse(r.windowEnd)-Date.parse(r.windowStart),86400000);
  assert.ok(calls.every(c=>c.start===r.windowStart&&c.end===r.windowEnd));
  assert.equal(r.sections[1].status,'unknown');assert.deepEqual(r.sections[1].rows,[]);assert.match(r.sections[1].reason,/일반 권한/);
  assert.equal(r.sections[2].rows[0].value,'0');assert.equal(r.sections[2].status,'ok');
});
test('timeout, elevated process and invalid counts are never zero-success',async()=>{
  for(const code of ['TIMEOUT','ELEVATED','READ_FAILED']){
    const r=await inspector({read:async()=>({ok:false,code})})();
    assert.ok(r.sections.every(s=>s.status==='unknown'&&s.rows.length===0&&s.reason));
  }
  const invalid=await inspector({read:async()=>({ok:true,rows:[{label:'error',value:'NaN',unit:'건'}]})})();
  assert.equal(invalid.sections[2].status,'unknown');
  const unsupported=await inspector({platform:'linux',read:()=>{throw Error('must not call');}})();
  assert.ok(unsupported.sections.every(s=>s.status==='unknown'));
});
test('separate inspection history survives reopen without altering event history',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'keshev-inspect-test-'));
  try{
    const options={directory,clock};const store=createHistoryStore({...options,category:'inspection'});
    await store.appendInspection(['pc'],await inspector()());
    const rows=await createHistoryStore({...options,category:'inspection'}).read(['pc']);
    assert.equal(rows.length,1);assert.equal(validInspection(rows[0]),true);
    assert.deepEqual(await createHistoryStore(options).read(['pc']),[]);
    assert.throws(()=>store.appendInspection(['pc'],{...rows[0],source:'example'}));
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('local HTTP fixture: PC success does not mean SDP connected; invalid input rejected',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'keshev-inspect-http-'));
  const server=createOnServer({historyDirectory:directory,clock,pcInspector:inspector()});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const post=body=>fetch(base+'/api/pc-inspection',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    assert.equal((await fetch(base+'/pc-inspection-view.mjs')).status,200);
    const result=await (await post({})).json();assert.equal(result.ok,true);assert.equal(result.data.saved,true);
    const sdp=await (await fetch(base+'/api/pc-inspection/sdp')).json();assert.equal(sdp.data.status,'disconnected');
    assert.equal((await (await fetch(base+'/api/pc-inspection/history')).json()).data.length,1);
    assert.equal((await post({unexpected:true})).ok,false);
  }finally{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
});
