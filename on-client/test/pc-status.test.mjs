import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPcSampler} from '../src/pc-status.mjs';
import {createHistoryStore} from '../src/history/store.mjs';
import {createOnServer} from '../src/server.mjs';
import {explainChange} from '../public/pc-status-view.mjs';

const G=1024**3;
const clock=()=>new Date('2026-10-27T00:00:00Z');
function fixture(overrides={}){
  let tick=0,cpu=0;
  return createPcSampler({clock,monotonic:()=>tick++*1000,wait:async()=>{},
    readCpus:()=>[{times:cpu++?{user:50,nice:0,sys:0,idle:150,irq:0}:{user:0,nice:0,sys:0,idle:100,irq:0}}],
    readTotal:()=>8*G,readFree:()=>3*G,readDisk:async()=>({bsize:4096n,bavail:262144n,blocks:524288n}),diskRoot:'C:\\',...overrides});
}
test('sample units, actual interval and independent failures without fallback numbers',async()=>{
  const result=await fixture()();
  assert.equal(result.source,'measured');assert.deepEqual(result.metrics.map(m=>m.value),[50,5,1]);
  assert.equal(result.metrics[0].intervalMs,1000);assert.deepEqual(result.metrics.map(m=>m.unit),['%','GiB','GiB']);
  const failed=await fixture({readFree:()=>NaN,readDisk:async()=>{throw Object.assign(Error('not exposed'),{code:'EACCES'});}})();
  assert.equal(failed.metrics[0].status,'ok');
  for(const metric of failed.metrics.slice(1)){assert.equal(metric.value,null);assert.equal(metric.status,'unknown');assert.equal(metric.measuredAt,null);assert.ok(metric.attemptedAt);}
  assert.match(failed.metrics[2].reason,/일반 권한/);
  const noCpu=await fixture({readCpus:()=>[]})();assert.equal(noCpu.metrics[0].value,null);
});
test('comparison uses latest valid same-target actual sample and percentage points',()=>{
  const metric={kind:'cpu',unit:'%',target:'cpu',status:'ok',value:50,measuredAt:'2026-10-27T00:01:00Z'};
  const current={source:'measured',queriedAt:'2026-10-27T00:01:00Z',metrics:[metric]};
  const previous={source:'measured',queriedAt:'2026-10-27T00:00:00Z',metrics:[{...metric,value:25,measuredAt:'2026-10-27T00:00:00Z'}]};
  assert.match(explainChange(current,metric,[previous]),/\+25.00 %p/);
  assert.match(explainChange(current,metric,[{...previous,source:'example'}]),/비교 자료 부족/);
  assert.match(explainChange(current,{...metric,status:'unknown',value:null},[previous]),/확인 불가/);
  assert.match(explainChange(current,{...metric,target:'other'},[previous]),/비교 자료 부족/);
  const invalid={...previous,queriedAt:'2026-10-27T00:00:30Z',metrics:[{...metric,status:'unknown',value:null}]};
  assert.match(explainChange(current,metric,[invalid,previous]),/\+25.00 %p/);
});
test('PC persistence is separate from security events, limited and restored',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'keshev-pc-test-'));
  let now=clock();const options={directory,clock:()=>now};
  try{
    const security=createHistoryStore(options);await security.append(['demo'],'demo',[{kind:'access',at:now.toISOString()}]);
    const sample=await fixture()();let pc=createHistoryStore({...options,category:'pc'});
    await pc.appendMeasurement(['pc'],sample);pc=createHistoryStore({...options,category:'pc'});
    assert.equal((await pc.read(['pc'])).length,1);assert.equal((await security.read(['demo'])).length,1);
    await assert.rejects(async()=>pc.appendMeasurement(['pc'],{...sample,source:'example'}));
    now=new Date('2026-12-01T00:00:00Z');assert.equal((await pc.read(['pc'])).length,0);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('HTTP requires same-origin POST, serves module, and preserves three measured fields',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'keshev-pc-http-'));
  const server=createOnServer({historyDirectory:directory,pcSampler:fixture()});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(base+'/pc-status-view.mjs')).status,200);
    assert.equal((await fetch(base+'/api/pc-status',{method:'POST',body:'{}'})).status,403);
    const response=await fetch(base+'/api/pc-status',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
    const result=await response.json();assert.equal(result.data.saved,true);assert.equal(result.data.metrics.length,3);
    assert.equal((await (await fetch(base+'/api/pc-status/history')).json()).data.length,1);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
