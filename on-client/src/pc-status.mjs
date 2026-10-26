import { cpus, freemem, totalmem, homedir } from 'node:os';
import { statfs } from 'node:fs/promises';
import { parse } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const GiB = 1024 ** 3;
const failure = error => ['EACCES', 'EPERM'].includes(error?.code)
  ? '일반 권한으로 읽을 수 없습니다. 권한을 높이지 않았습니다.'
  : error?.code === 'INVALID_SAMPLE' ? '측정값 또는 측정 구간을 검증할 수 없습니다.'
    : '운영체제에서 값을 읽지 못했습니다.';
const invalid = () => { throw Object.assign(Error('INVALID_SAMPLE'), { code: 'INVALID_SAMPLE' }); };
function cpuTotals(rows) {
  if (!Array.isArray(rows) || rows.length === 0) invalid();
  return rows.map(row => {
    const times = ['user', 'nice', 'sys', 'idle', 'irq'].map(key => row.times?.[key]);
    if (times.some(value => !Number.isFinite(value) || value < 0)) invalid();
    return { idle: row.times.idle, total: times.reduce((a,b) => a+b,0) };
  });
}

// OS APIs only: no shells, privilege elevation, agents, identifiers or process lists.
export function createPcSampler({ readCpus = cpus, readFree = freemem, readTotal = totalmem,
  readDisk = statfs, diskRoot = parse(homedir()).root, wait = delay,
  clock = () => new Date(), monotonic = () => performance.now() } = {}) {
  return async function sample() {
    const queriedAt = clock().toISOString();
    const measure = async (kind, unit, target, work) => {
      try { return { kind, unit, target, status: 'ok', ...await work(), measuredAt: clock().toISOString() }; }
      catch (error) { return { kind, unit, target, status: 'unknown', value: null, measuredAt: null,
        attemptedAt: clock().toISOString(), reason: failure(error) }; }
    };
    const metrics = await Promise.all([
      measure('cpu', '%', '전체 논리 CPU', async () => {
        const startedAt = clock().toISOString();const start = monotonic();const a = cpuTotals(readCpus());
        await wait(1000);
        const b = cpuTotals(readCpus());const intervalMs = monotonic()-start;
        if (a.length !== b.length || intervalMs < 500 || intervalMs > 10000) invalid();
        let total=0,idle=0;
        for(let i=0;i<a.length;i++){
          const dt=b[i].total-a[i].total,di=b[i].idle-a[i].idle;
          if(dt<0||di<0||di>dt)invalid();total+=dt;idle+=di;
        }
        if(total<=0)invalid();
        return { value: 100*(1-idle/total), startedAt, intervalMs };
      }),
      measure('memory', 'GiB', '시스템 물리 메모리 · 전체−여유', async () => {
        const total=readTotal(),free=readFree();
        if(!Number.isFinite(total)||!Number.isFinite(free)||total<=0||free<0||free>total)invalid();
        return {value:(total-free)/GiB};
      }),
      measure('disk', 'GiB', `사용자 홈 드라이브 ${diskRoot}`, async () => {
        const disk=await readDisk(diskRoot,{bigint:true});
        if(disk.bsize<=0n||disk.bavail<0n||disk.blocks<disk.bavail)invalid();
        const value=Number(disk.bavail*disk.bsize)/GiB;
        if(!Number.isFinite(value))invalid();return {value};
      }),
    ]);
    return {source:'measured',queriedAt,metrics};
  };
}
