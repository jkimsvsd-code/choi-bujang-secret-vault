import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';

const execute=promisify(execFile);
export const inspectionKinds=['network','firewall','system','application'];
const reasons={DENIED:'일반 권한으로 읽을 수 없습니다. 권한을 높이지 않았습니다.',
  ELEVATED:'앱이 관리자 권한으로 실행되어 조회하지 않았습니다. 일반 권한으로 다시 실행하세요.',
  TIMEOUT:'조회 제한 시간을 초과했습니다. 부분 결과를 정상 건수로 표시하지 않습니다.',
  UNSUPPORTED:'Windows에서만 지원되는 조회입니다.',
  READ_FAILED:'운영체제 조회를 완료하지 못했습니다. 명령 지원 여부 또는 서비스 상태를 확인하세요.',
  INVALID:'조회 응답 형식을 검증할 수 없습니다.'};

// Fixed read-only scripts. No user input, elevation, policy writes, event messages or remote queries.
function scriptFor(kind,start,end){
  if(kind==='network')return `
    $items=@(Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=True' -ErrorAction Stop)
    foreach($n in $items){
      $name=[string]$n.Description
      foreach($pair in @(
        @('IP',(@($n.IPAddress) -join ', ')),
        @('Subnet',(@($n.IPSubnet) -join ', ')),
        @('Gateway',(@($n.DefaultIPGateway) -join ', ')),
        @('DNS',(@($n.DNSServerSearchOrder) -join ', '))
      )){[pscustomobject]@{label="$name / $($pair[0])";value=$(if([string]::IsNullOrWhiteSpace($pair[1])){'미설정'}else{$pair[1]});unit='주소'}}
    }`;
  if(kind==='firewall')return `
    $profiles=@(Get-NetFirewallProfile -PolicyStore ActiveStore -ErrorAction Stop)
    if($profiles.Count -ne 3){throw 'Incomplete profiles'}
    foreach($p in $profiles){
      [pscustomobject]@{label="$($p.Name) / Enabled";value=[string]$p.Enabled;unit='설정'}
      [pscustomobject]@{label="$($p.Name) / 기본 인바운드";value=[string]$p.DefaultInboundAction;unit='정책'}
      [pscustomobject]@{label="$($p.Name) / 기본 아웃바운드";value=[string]$p.DefaultOutboundAction;unit='정책'}
    }`;
  const log=kind==='system'?'System':'Application';
  return `
    $query=[System.Diagnostics.Eventing.Reader.EventLogQuery]::new('${log}',[System.Diagnostics.Eventing.Reader.PathType]::LogName,"*[System[(Level=2 or Level=3) and TimeCreated[@SystemTime >= '${start}' and @SystemTime <= '${end}']]]")
    $reader=[System.Diagnostics.Eventing.Reader.EventLogReader]::new($query)
    $warnings=0; $errors=0
    try { while($null -ne ($record=$reader.ReadEvent())){
      try {if($record.Level -eq 3){$warnings++}elseif($record.Level -eq 2){$errors++}}finally{$record.Dispose()}
    }}finally{$reader.Dispose()}
    [pscustomobject]@{label='경고 (Level 3)';value=[string]$warnings;unit='건'}
    [pscustomobject]@{label='오류 (Level 2)';value=[string]$errors;unit='건'}`;
}

export async function readWindows(kind,{start,end,signal}={}){
  if(!inspectionKinds.includes(kind)||![start,end].every(v=>typeof v==='string'&&new Date(v).toISOString()===v))throw Error('INVALID');
  const script=`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
  try {
    $principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
      @{ok=$false;code='ELEVATED'} | ConvertTo-Json -Compress; exit
    }
    $rows=@(& { ${scriptFor(kind,start,end)} })
    @{ok=$true;rows=$rows} | ConvertTo-Json -Depth 5 -Compress
  }catch{
    $code='READ_FAILED'; if($_.FullyQualifiedErrorId -match '80041003|AccessDenied|UnauthorizedAccess'){$code='DENIED'}; $e=$_.Exception
    while($null -ne $e){if($e -is [UnauthorizedAccessException] -or ($e.HResult -band 65535) -eq 5){$code='DENIED'}; $e=$e.InnerException}
    @{ok=$false;code=$code} | ConvertTo-Json -Compress
  }`;
  try{
    const {stdout}=await execute(join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
      ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
      {windowsHide:true,timeout:7500,maxBuffer:256*1024,encoding:'utf8',signal});
    return JSON.parse(stdout.replace(/^\uFEFF/,''));
  }catch(error){return {ok:false,code:error.killed||error.name==='AbortError'?'TIMEOUT':'READ_FAILED'};}
}

export function validInspection(sample){
  return sample?.source==='measured'&&Number.isFinite(Date.parse(sample.queriedAt))&&
    Date.parse(sample.windowEnd)===Date.parse(sample.queriedAt)&&Date.parse(sample.windowEnd)-Date.parse(sample.windowStart)===86400000&&
    Array.isArray(sample.sections)&&sample.sections.length===4&&inspectionKinds.every(kind=>sample.sections.filter(s=>s.kind===kind).length===1)&&
    sample.sections.every(s=>Number.isFinite(Date.parse(s.checkedAt))&&['ok','unknown'].includes(s.status)&&
      typeof s.reason==='string'&&s.reason.length<=300&&Array.isArray(s.rows)&&s.rows.length<=1000&&
      (s.status!=='unknown'||s.rows.length===0)&&s.rows.every(r=>['label','value','unit'].every(k=>typeof r[k]==='string'&&r[k].length<=2000)));
}

export function createPcInspector({read=readWindows,platform=process.platform,clock=()=>new Date()}={}){
  return async({signal}={})=>{
    const end=clock().toISOString(),start=new Date(Date.parse(end)-86400000).toISOString();
    const sections=await Promise.all(inspectionKinds.map(async kind=>{
      let result;
      try{result=platform==='win32'?await read(kind,{start,end,signal}):{ok:false,code:'UNSUPPORTED'};}catch{result={ok:false,code:'READ_FAILED'};}
      const rows=result?.rows;
      let ok=result?.ok===true&&Array.isArray(rows)&&rows.length<=1000&&rows.every(r=>r&&['label','value','unit'].every(k=>typeof r[k]==='string'&&r[k].length<=2000));
      if(ok&&['system','application'].includes(kind))ok=rows.length===2&&rows.every(r=>r.unit==='건'&&/^\d+$/.test(r.value)&&Number.isSafeInteger(Number(r.value)));
      if(ok&&kind==='firewall')ok=rows.length===9;
      return {kind,status:ok?'ok':'unknown',checkedAt:clock().toISOString(),
        rows:ok?rows.map(({label,value,unit})=>({label,value,unit})):[],reason:ok?'':reasons[result?.code]||reasons.INVALID};
    }));
    return {source:'measured',queriedAt:end,windowStart:start,windowEnd:end,sections};
  };
}
