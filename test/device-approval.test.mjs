import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {generateKeyPairSync,randomBytes,randomUUID,createHash,sign} from 'node:crypto';
import {encodeCBOR} from '@levischuck/tiny-cbor';
import * as webauthn from '@simplewebauthn/server';
import {hash,requireDeviceApproval} from '../src/device-access.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const origin='https://fixture.invalid',rpID='fixture.invalid';
const b64=b=>Buffer.from(b).toString('base64url');
function database(){
 const tables={vault_device_credentials:[],vault_device_challenges:[],vault_device_grants:[]};
 const db={from(name){let filters=[],op='select',values,head=false;
 const q={eq(k,v){filters.push(r=>r[k]===v);return q;},gt(k,v){filters.push(r=>r[k]>v);return q;},limit(){return q;},select(_cols,opts){head=opts?.head;return q;},insert(v){op='insert';values=v;return q;},update(v){op='update';values=v;return q;},delete(){op='delete';return q;},maybeSingle(){return Promise.resolve(run(true));},then(resolve,reject){return Promise.resolve(run()).then(resolve,reject);}};
 function run(single=false){const rows=tables[name];if(!rows)throw Error(name);let found=rows.filter(r=>filters.every(f=>f(r)));
 if(op==='insert'){rows.push({...values,...(name==='vault_device_credentials'?{status:'pending'}:{}),created_at:new Date().toISOString()});return {error:null};}
 if(op==='update')found.forEach(r=>Object.assign(r,values));
 if(op==='delete')tables[name]=rows.filter(r=>!found.includes(r));
 return {error:null,data:head?null:single?(found[0]?{...found[0]}:null):found.map(r=>({...r})),count:found.length};}
 return q;}};return {db,tables};
}
function harness(){const {db,tables}=database();const source=readFileSync(new URL('../api/device.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default async function','async function');
 const handler=vm.runInNewContext(source+';handler',{...webauthn,randomBytes,randomUUID,hash,requireDeviceApproval,Buffer,TextEncoder,URL,config:{publicAppUrl:origin},process:{env:{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:'fixture'}},createClient:()=>db,createLoginVerifier:()=>async a=>a==='Bearer fixture'?{userId:owner,kind:'student'}:null});
 const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
 return {db,tables,async call(body,headers={}){const r=res();await handler({method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer fixture',...headers},body},r);return r;},async allowed(grant,authorization='Bearer fixture'){const r=res();return requireDeviceApproval({headers:{authorization,'x-device-grant':grant}},r,db,{userId:owner,kind:'student'});}};
}
function authenticator(){const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),id=randomBytes(32);
 const cose=encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
 const authData=(flags,counter)=>{const tail=Buffer.alloc(5);tail[0]=flags;tail.writeUInt32BE(counter,1);return Buffer.concat([createHash('sha256').update(rpID).digest(),tail]);};
 return {registration(challenge,flags=0x45){const client=Buffer.from(JSON.stringify({type:'webauthn.create',challenge,origin}));const size=Buffer.alloc(2);size.writeUInt16BE(id.length);const data=Buffer.concat([authData(flags,0),Buffer.alloc(16),size,id,Buffer.from(cose)]);const att=encodeCBOR(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(data)]]));return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),attestationObject:b64(att)}};},assertion(challenge,counter=1){const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin}));const data=authData(5,counter);const signature=sign('sha256',Buffer.concat([data,createHash('sha256').update(client).digest()]),privateKey);return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),authenticatorData:b64(data),signature:b64(signature)}};}};
}
test('real WebAuthn verification: pending never grants access; approval + signature works; replay/session change/revocation/expiry fail',async()=>{
 const h=harness(),a=authenticator();
 const start=await h.call({action:'register-options'});assert.equal(start.code,200);
 const pending=await h.call({action:'register-verify',challengeId:start.body.challengeId,response:a.registration(start.body.options.challenge)});assert.equal(pending.code,202);assert.equal(h.tables.vault_device_credentials[0].status,'pending');assert.equal(h.tables.vault_device_grants.length,0);
 assert.equal(await h.allowed('a'.repeat(43)),false);
 assert.equal((await h.call({action:'authenticate-options'})).code,409);
 // Simulate the administrator's separate, explicit DB approval.
 h.tables.vault_device_credentials[0].status='approved';
 const options=await h.call({action:'authenticate-options'});
 const body={action:'authenticate-verify',challengeId:options.body.challengeId,response:a.assertion(options.body.options.challenge)};
 const verified=await h.call(body);assert.equal(verified.code,200);assert.equal(await h.allowed(verified.body.grant),true);
 assert.equal((await h.call(body)).code,400);
 assert.equal(await h.allowed(verified.body.grant,'Bearer other-session'),false);
 h.tables.vault_device_credentials[0].status='revoked';assert.equal(await h.allowed(verified.body.grant),false);
 h.tables.vault_device_credentials[0].status='approved';h.tables.vault_device_grants[0].expires_at=new Date(0).toISOString();assert.equal(await h.allowed(verified.body.grant),false);
});
test('wrong origin, missing login, forged signature and synced passkeys cannot authorize',async()=>{
 const h=harness(),a=authenticator();assert.equal((await h.call({action:'register-options'},{origin:'https://attacker.invalid'})).code,403);assert.equal((await h.call({action:'register-options'},{authorization:''})).code,401);
 const options=await h.call({action:'register-options'});assert.equal((await h.call({action:'register-verify',challengeId:options.body.challengeId,response:a.registration(options.body.options.challenge,0x4d)})).code,403);
 const registration=await h.call({action:'register-options'});await h.call({action:'register-verify',challengeId:registration.body.challengeId,response:a.registration(registration.body.options.challenge)});h.tables.vault_device_credentials[0].status='approved';
 const auth=await h.call({action:'authenticate-options'});const response=a.assertion(auth.body.options.challenge);response.response.signature=b64(randomBytes(64));assert.equal((await h.call({action:'authenticate-verify',challengeId:auth.body.challengeId,response})).code,400);assert.equal(h.tables.vault_device_grants.length,0);
});

test('every protected handler denies login-only access before any resource DB read',async()=>{
 for(const path of ['api/notes.js','api/notices.js','api/restore-note.js','src/instructor-api.mjs']){
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default async function','async function').replace('export async function','async function');
  let touched=false;
  const fn=vm.runInNewContext(source+';'+(path.startsWith('src/')?'handleInstructorResource':'handler'),{config:{},console:{warn(){}},process:{env:{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:'fixture'}},requireDeviceApproval,createLoginVerifier:()=>async()=>({kind:'student',userId:owner}),createClient:()=>({from(){touched=true;throw Error('resource access');},rpc(){touched=true;throw Error('resource access');}})});
  const res={setHeader(){},status(c){this.code=c;return this;},json(d){this.body=d;return this;}};
  await fn({method:path.includes('restore')?'POST':'GET',headers:{authorization:'Bearer fixture'},body:{id:'92cd9cd2-589c-4e18-9e4c-3c9a2bd1aa69',mode:'preview'}},res,'read_material');
  assert.equal(res.code,403,path);assert.equal(res.body.error,'device_not_approved',path);assert.equal(touched,false,path);
 }
});
