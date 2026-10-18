import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { RULE_IDS } from '../src/decider.mjs';
import { summaryLines, createOperationsView } from '../public/operations-client.js';
const target = '92cd9cd2-589c-4e18-9e4c-3c9a2bd1aa69';
function fixture() {
  const state = { approved: true, rpcError: null }, logs = [], calls = [];
  const source = readFileSync(new URL('../api/operations.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default async function', 'async function');
  const handler = vm.runInNewContext(source + ';handler', {
    RULE_IDS, config: {}, randomUUID: () => target,
    process: { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } },
    createLoginVerifier: () => async auth => {
      if(auth !== 'Bearer fixture') throw Error('private auth error');
      return { kind: 'student', userId: target };
    },
    requireDeviceApproval: async (_req, res) => {
      if(state.approved) return true;
      res.status(403).json({ error: 'device_not_approved' }); return false;
    },
    createClient: () => ({ rpc: async (name, args) => {
      calls.push({ name, ...args });
      return { error: state.rpcError, data: { id: target, ownerMatches: true, idMatches: true,
        hashMatches: true, restored: false, contentHash: 'a'.repeat(64), body: 'PRIVATE_BODY', owner_id: 'PRIVATE_OWNER' } };
    } }),
    console: { info: line => logs.push(JSON.parse(line)) },
  });
  async function request(auth = 'Bearer fixture', method = 'GET') {
    const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; },
      status(code) { this.code=code; return this; }, json(data) { this.data=JSON.parse(JSON.stringify(data)); return this; } };
    await handler({ method, headers: { authorization: auth } }, res); return res;
  }
  return { state, logs, calls, request };
}
test('API snapshot, displayed count/version and redacted log match; preview never applies recovery', async () => {
  const f = fixture(), res = await f.request();
  assert.equal(res.code, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const { event, ...record } = f.logs[0];
  assert.equal(event, 'operations_summary');
  assert.deepEqual(record, res.data);
  assert.equal(record.rules.count, RULE_IDS.length);
  const text = summaryLines(res.data).join('\n');
  assert(text.includes(`${record.rules.count}개`));
  assert(text.includes(record.recovery.version));
  assert(text.includes(record.snapshotId));
  assert.equal(record.detection.count, null);
  assert.equal(record.revocation.count, null);
  assert.equal(record.recovery.execution, 'not_run');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].p_apply, false);
  assert.equal(f.calls[0].p_hash, null);
  assert(!JSON.stringify(record).includes('PRIVATE'));
  assert(!JSON.stringify(record).includes('Bearer'));
});
test('missing/invalid authentication, wrong method and unapproved device cannot read or log a summary', async () => {
  const f = fixture();
  assert.equal((await f.request('')).code, 401);
  assert.equal((await f.request('invalid')).code, 401);
  assert.equal((await f.request('Bearer fixture', 'POST')).code, 405);
  f.state.approved=false;
  assert.equal((await f.request()).code, 403);
  assert.equal(f.calls.length, 0); assert.equal(f.logs.length, 0);
});
test('forbidden/failed preview stays unknown without leaking DB messages or claiming completion', async () => {
  const f = fixture();
  for (const code of ['42501','P0001']) {
    f.state.rpcError={code,message:'PRIVATE_DATABASE_ERROR'};
    const res=await f.request();
    assert.equal(res.data.recovery.version,null);
    assert.equal(res.data.recovery.status,'unavailable');
    assert(summaryLines(res.data).join('\n').includes('확인 불가'));
    assert(!JSON.stringify(f.logs).includes('PRIVATE'));
  }
});
test('late successful response cannot repopulate cleared operation screen', async () => {
  const f=fixture(), res=await f.request();
  let resolve, headers={Authorization:'fixture'};
  const output={textContent:''}, button={addEventListener(){},disabled:false};
  const view=createOperationsView({output,button,getHeaders:()=>headers,onDenied(){},
    fetcher:()=>new Promise(r=>{resolve=r;})});
  const pending=view.refresh(); headers=null; view.clear();
  resolve({ok:true,status:200,json:async()=>res.data}); await pending;
  assert(output.textContent.startsWith('미실행')); assert.equal(button.disabled,true);
});
test('screen renders API data exactly, removes stale values on failure, and clears on rejection', async () => {
  const f=fixture(), res=await f.request();
  const output={textContent:''}, button={addEventListener(){},disabled:false};
  let mode='ok', denied=false;
  const view=createOperationsView({output,button,getHeaders:()=>({Authorization:'fixture'}),
    onDenied(){denied=true;},fetcher:async()=>{
      if(mode==='error') throw Error('network');
      return {ok:mode==='ok',status:mode==='ok'?200:403,json:async()=>res.data};
    }});
  await view.refresh(); assert.equal(output.textContent,summaryLines(res.data).join('\n\n'));
  mode='error'; await view.refresh(); assert(!output.textContent.includes(res.data.snapshotId));
  mode='denied'; await view.refresh(); assert(denied); assert(output.textContent.startsWith('미실행'));
});
