import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../public/'+p, import.meta.url),'utf8');
test('worker never intercepts protected APIs; entry failure gives no-store guidance', async () => {
  const handlers = {};
  let fail = false;
  const denied = new Response('denied', {status:401});
  vm.runInNewContext(read('sw.js'), { URL, Response,
    self: {location:{origin:'https://fixture.invalid'},addEventListener:(n,f)=>handlers[n]=f},
    fetch:async()=>{if(fail) throw new Error('offline'); return denied;},
  });
  for(const path of ['/api/auth','/api/notes','/api/notes/id','/api/restore-note','/api/notices','/api/instructor/materials/id']) {
    for(const method of ['GET','POST','PUT','DELETE']) {
      let intercepted=false;
      handlers.fetch({request:{url:'https://fixture.invalid'+path,method,mode:'navigate'},respondWith(){intercepted=true;}});
      assert.equal(intercepted,false);
    }
  }
  let response;
  const event={request:{url:'https://fixture.invalid/',method:'GET',mode:'navigate'},respondWith(r){response=r;}};
  handlers.fetch(event); assert.equal(await response,denied);
  fail=true; handlers.fetch(event);
  const offline=await response;
  assert.equal(offline.status,503);
  assert.equal(offline.headers.get('cache-control'),'no-store');
  assert.match(await offline.text(),/기기 승인: 확인 불가/);
});
test('installation and connectivity cannot promote device approval or call protected APIs', async () => {
  const handlers={}, nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',addEventListener(){}});return nodes.get(id);};
  node('#device-status').textContent='기기 승인: 확인 불가';
  const navigator={onLine:true};
  vm.runInNewContext(read('app-status.js'),{
    document:{querySelector:node},navigator,
    window:{matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener:(n,f)=>handlers[n]=f},
    fetch(){assert.fail('status must not send requests');},
  });
  handlers.appinstalled();
  assert.match(node('#install-status').textContent,/기기 승인은 별도/);
  navigator.onLine=false;handlers.offline();
  assert.match(node('#connection-status').textContent,/오프라인/);
  assert.equal(node('#device-status').textContent,'기기 승인: 확인 불가');
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons) assert.equal(readFileSync(new URL('../public'+icon.src,import.meta.url)).readUInt32BE(16),parseInt(icon.sizes));
});
