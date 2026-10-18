const decode = text => Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function deviceRequest(token,action,extra={},grant) {
 const r=await fetch('/api/device',{method:'POST',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...(grant?{'X-Device-Grant':grant}:{})},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(15000)});
 const data=await r.json();
 if(!r.ok)throw new Error(data.error||'device_verification_failed');
 return data;
}
export async function runDeviceCeremony(token,registration) {
 if(!window.PublicKeyCredential||!navigator.credentials)throw new Error('webauthn_unavailable');
 const prefix=registration?'register':'authenticate';
 const {options,challengeId}=await deviceRequest(token,prefix+'-options');
 const publicKey={...options,challenge:decode(options.challenge)};
 if(registration){publicKey.user={...options.user,id:decode(options.user.id)};publicKey.excludeCredentials=options.excludeCredentials?.map(c=>({...c,id:decode(c.id)}));}
 else publicKey.allowCredentials=options.allowCredentials?.map(c=>({...c,id:decode(c.id)}));
 const credential=registration?await navigator.credentials.create({publicKey}):await navigator.credentials.get({publicKey});
 if(!credential)throw new Error('device_verification_cancelled');
 const r=credential.response;
 const response={id:credential.id,rawId:encode(credential.rawId),type:credential.type,clientExtensionResults:credential.getClientExtensionResults(),response:{clientDataJSON:encode(r.clientDataJSON),...(registration?{attestationObject:encode(r.attestationObject),transports:r.getTransports?.()??[]}:{authenticatorData:encode(r.authenticatorData),signature:encode(r.signature),userHandle:r.userHandle?encode(r.userHandle):undefined})}};
 return deviceRequest(token,prefix+'-verify',{challengeId,response});
}
