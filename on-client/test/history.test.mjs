import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHistoryStore } from '../src/history/store.mjs';
import { createOnServer } from '../src/server.mjs';
import { demoEngine } from '../src/engine.mjs';

const event={kind:'access',at:'2026-10-01T00:00:00Z',summary:'excluded-fixture-text',id:'excluded-id'};
test('persistent minimal records, partitions, retention and clear',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'keshev-history-test-'));
  let now=new Date('2026-10-01T00:00:00Z');
  const options={directory,clock:()=>now};
  try{
    let store=createHistoryStore(options);
    await store.append(['demo'],'demo',[event]);
    store=createHistoryStore(options);
    assert.equal((await store.read(['demo'])).length,1);
    assert.equal((await store.read(['other-account'])).length,0);
    assert.equal((await readFile(join(directory,'queries.json'),'utf8')).includes('excluded'),false);
    await store.append(['account'],'connected',[event]);
    await store.clear(['demo']);
    assert.equal((await store.read(['account'])).length,1);
    assert.equal((await store.read(['demo'])).length,0);
    now=new Date('2026-11-02T00:00:00Z');
    assert.equal((await store.read(['account'])).length,0);
    await store.append(['demo'],'demo',Array.from({length:1002},()=>event));
    assert.equal((await store.read(['demo'])).length,1000);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('HTTP demo restart, origin rejection and disconnected denial',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'keshev-history-http-'));
  let server;
  const start=async engine=>{
    server=createOnServer({engine,historyDirectory:directory});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const close=()=>new Promise(resolve=>server.close(resolve));
  try{
    let base=await start(demoEngine());
    const result=await (await fetch(`${base}/api/events`)).json();
    assert.equal(result.history.status,'saved');
    await close();base=await start(demoEngine());
    assert.equal((await (await fetch(`${base}/api/history`)).json()).data.length,1);
    assert.equal((await fetch(`${base}/api/history/clear`,{method:'POST',headers:{Origin:'http://untrusted.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await (await fetch(`${base}/api/history`)).json()).data.length,1);
    const queryId=(await (await fetch(`${base}/api/history`)).json()).data[0].queryId;
    assert.equal((await fetch(`${base}/api/history/clear`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({queryId})})).status,200);
    await close();base=await start({evidenceMode:'disconnected'});
    assert.notEqual((await fetch(`${base}/api/history`)).status,200);
  }finally{if(server?.listening)await close();await rm(directory,{recursive:true,force:true});}
});
test('HTTP account isolation, inactive denial and storage failure preserves current events',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'keshev-history-scope-'));
  const fixture=demoEngine();let user='fixture-a';let active=true;
  const engine={...fixture,evidenceMode:'connected',
    readIdentity:async()=>{const identity=await fixture.readIdentity();identity.user.id=user;identity.session.status=active?'active':'expired';return identity;},
    readEvents:async()=> (await fixture.readEvents()).map(row=>({...row,subjectId:user,projectId:fixture.projectId})),
  };
  const server=createOnServer({engine,historyDirectory:directory});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const get=async path=>(await fetch(base+path)).json();
  try{
    assert.equal((await get('/api/events')).history.status,'saved');
    const queryId=(await get('/api/history')).data[0].queryId;
    user='fixture-b';assert.equal((await get('/api/history')).data.length,0);
    assert.equal((await fetch(base+'/api/history/clear',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({queryId})})).status,503);
    user='fixture-a';assert.equal((await get('/api/history')).data.length,1);
    active=false;assert.equal((await get('/api/history')).ok,false);active=true;
    await writeFile(join(directory,'queries.json'),'broken fixture');
    const result=await get('/api/events');
    assert.equal(result.ok,true);assert.equal(result.data.length,1);assert.equal(result.history.status,'error');
    assert.equal((await get('/api/history')).ok,false);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
