import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {createLoginVerifier} from '../src/verify-login.mjs';
import {hash,requireDeviceApproval} from '../src/device-access.mjs';
import config from '../aleph.config.json' with {type:'json'};
let verifier;
const origin = new URL(config.publicAppUrl).origin;
const rpID = new URL(origin).hostname;
const fail = (res,status,error) => res.status(status).json({error});
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(res,405,'method_not_allowed');}
 if(req.headers?.origin !== origin) return fail(res,403,'origin_not_allowed');
 if(!/^application\/json(?:;|$)/i.test(req.headers?.['content-type']??''))return fail(res,415,'json_required');
 if(!req.headers?.authorization)return fail(res,401,'authentication_required');
 const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!secret)return fail(res,503,'device_service_unavailable');
 let identity;
 try{verifier??=createLoginVerifier({config,supabaseSecretKey:secret});identity=await verifier(req.headers.authorization);}catch{return fail(res,401,'authentication_failed');}
 if(identity?.kind!=='student')return fail(res,403,'student_required');
 let input;
 try{const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(!raw||raw.length>32768)throw Error();input=JSON.parse(raw);}catch{return fail(res,400,'invalid_device_request');}
 if(!input||!['register-options','register-verify','authenticate-options','authenticate-verify','status'].includes(input.action))return fail(res,400,'invalid_device_request');
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const owner=identity.userId,sessionHash=hash(req.headers.authorization);
 try{
  if(input.action==='status'){
   if(!await requireDeviceApproval(req,res,db,identity))return;
   return res.status(200).json({status:'approved'});
  }
  if(input.action.endsWith('-options')){
   const recent=await db.from('vault_device_challenges').select('id',{count:'exact',head:true}).eq('owner_id',owner).gt('created_at',new Date(Date.now()-60000).toISOString());
   if(recent.error)return fail(res,503,'device_service_unavailable');
   if(recent.count>=10)return fail(res,429,'too_many_requests');
   const credentials=await db.from('vault_device_credentials').select('id,status').eq('owner_id',owner).limit(21);
   if(credentials.error)return fail(res,503,'device_service_unavailable');
   const registration=input.action==='register-options';
   if(registration&&credentials.data.length>=20)return fail(res,429,'device_limit_reached');
   const approved=credentials.data.filter(c=>c.status==='approved');
   if(!registration&&!approved.length)return res.status(409).json({error:'approval_pending_or_missing'});
   const options=registration
    ? await generateRegistrationOptions({rpName:'최 부장 자료실',supportedAlgorithmIDs:[-7],rpID,userName:'자료실 사용자',userID:new TextEncoder().encode(owner),attestationType:'none',excludeCredentials:credentials.data.map(c=>({id:c.id})),authenticatorSelection:{residentKey:'discouraged',userVerification:'required'},timeout:60000})
    : await generateAuthenticationOptions({rpID,allowCredentials:approved.map(c=>({id:c.id})),userVerification:'required',timeout:60000});
   const challengeId=randomUUID();
   const saved=await db.from('vault_device_challenges').insert({id:challengeId,owner_id:owner,session_hash:sessionHash,purpose:registration?'register':'authenticate',challenge:options.challenge,expires_at:new Date(Date.now()+120000).toISOString()});
   if(saved.error)return fail(res,503,'device_service_unavailable');
   return res.status(200).json({challengeId,options});
  }
  if(typeof input.challengeId!=='string'||! /^[0-9a-f-]{36}$/i.test(input.challengeId)||!input.response)return fail(res,400,'invalid_device_request');
  const registration=input.action==='register-verify';
  // DELETE RETURNING atomically consumes a challenge, including on failed verification.
  const consumed=await db.from('vault_device_challenges').delete().eq('id',input.challengeId).eq('owner_id',owner).eq('session_hash',sessionHash).eq('purpose',registration?'register':'authenticate').select('challenge,expires_at').maybeSingle();
  if(consumed.error||!consumed.data||Date.parse(consumed.data.expires_at)<=Date.now())return fail(res,400,'challenge_invalid');
  const expected={response:input.response,expectedChallenge:consumed.data.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true};
  if(registration){
   const result=await verifyRegistrationResponse({...expected,supportedAlgorithmIDs:[-7]}),info=result.registrationInfo;
   if(!result.verified||!info||info.credentialDeviceType!=='singleDevice'||info.credentialBackedUp)return fail(res,403,'device_bound_authenticator_required');
   const saved=await db.from('vault_device_credentials').insert({id:info.credential.id,owner_id:owner,public_key:Buffer.from(info.credential.publicKey).toString('base64url'),counter:info.credential.counter});
   if(saved.error)return fail(res,saved.error.code==='23505'?409:503,'registration_not_saved');
   return res.status(202).json({status:'pending'});
  }
  const found=await db.from('vault_device_credentials').select('id,public_key,counter,status').eq('id',input.response.id).eq('owner_id',owner).eq('status','approved').maybeSingle();
  if(found.error||!found.data)return fail(res,403,'device_not_approved');
  const c=found.data;
  const result=await verifyAuthenticationResponse({...expected,credential:{id:c.id,publicKey:new Uint8Array(Buffer.from(c.public_key,'base64url')),counter:Number(c.counter)}});
  if(!result.verified||result.authenticationInfo.credentialDeviceType!=='singleDevice'||result.authenticationInfo.credentialBackedUp)return fail(res,403,'device_not_approved');
  const updated=await db.from('vault_device_credentials').update({counter:result.authenticationInfo.newCounter}).eq('id',c.id).eq('owner_id',owner).eq('counter',c.counter).eq('status','approved').select('id').maybeSingle();
  if(updated.error||!updated.data)return fail(res,403,'device_not_approved');
  const grant=randomBytes(32).toString('base64url'),expiresAt=Date.now()+300000;
  const saved=await db.from('vault_device_grants').insert({token_hash:hash(grant),credential_id:c.id,owner_id:owner,session_hash:sessionHash,expires_at:new Date(expiresAt).toISOString()});
  if(saved.error)return fail(res,503,'device_service_unavailable');
  return res.status(200).json({status:'approved',grant,expiresAt});
 }catch{return fail(res,400,'device_verification_failed');}
}
