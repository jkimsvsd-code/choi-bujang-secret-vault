import {validInspection} from '../pc-inspection.mjs';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

export const defaultHistoryDirectory = () => join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Keshev', 'history');
// No source identifiers, summaries, evidence, credentials or free text are persisted.
export function createHistoryStore({ directory = defaultHistoryDirectory(), clock = () => new Date(), category = 'events' } = {}) {
  if(!['events','pc','inspection'].includes(category))throw Error('HISTORY_CATEGORY');
  const basename=category==='pc'?'pc-status':category==='inspection'?'pc-inspection':'queries';
  const file = join(directory, `${basename}.json`);
  const lock = join(directory, `${basename}.lock`);
  const scopeKey = scope => createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  async function transaction(work) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // Fail visibly on another writer, rather than losing its records. A stale lock is not removed automatically.
    const handle = await open(lock, 'wx', 0o600);
    const temporary = join(directory, `${randomUUID()}.tmp`);
    try {
      let rows;
      try { rows = JSON.parse(await readFile(file, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; rows = []; }
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row.scope !== 'string' || !Number.isFinite(Date.parse(row.queriedAt)))) throw Error('HISTORY_INVALID');
      const cutoff = clock().getTime() - 30 * 86400000;
      rows = rows.filter(row => Date.parse(row.queriedAt) >= cutoff);
      const result = await work(rows);
      rows.sort((a,b) => Date.parse(b.queriedAt) - Date.parse(a.queriedAt));
      rows.splice(1000);
      await writeFile(temporary, JSON.stringify(rows), { mode: 0o600 });
      await rename(temporary, file);
      return result(rows);
    } finally {
      await handle.close();
      await unlink(lock);
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  return {
    appendInspection(scope,sample) {
      if(category!=='inspection'||!validInspection(sample))throw Error('PC_INSPECTION_INVALID');
      const {source,queriedAt,windowStart,windowEnd}=sample;
      const sections=sample.sections.map(({kind,status,checkedAt,reason,rows})=>({kind,status,checkedAt,reason,rows:rows.map(({label,value,unit})=>({label,value,unit}))}));
      return transaction(rows=>{rows.unshift({scope:scopeKey(scope),queryId:randomUUID(),source,queriedAt,windowStart,windowEnd,sections});return ()=>({saved:true});});
    },
    appendMeasurement(scope, sample) {
      if(category!=='pc'||sample.source!=='measured'||!Number.isFinite(Date.parse(sample.queriedAt))||!Array.isArray(sample.metrics)||sample.metrics.length!==3)throw Error('PC_SAMPLE_INVALID');
      const metrics=sample.metrics.map(metric=>{
        if(!['cpu','memory','disk'].includes(metric.kind)||!['ok','unknown'].includes(metric.status)||metric.unit!==(metric.kind==='cpu'?'%':'GiB')||typeof metric.target!=='string'||metric.target.length>100)throw Error('PC_SAMPLE_INVALID');
        if(metric.status==='ok'){
          if(!Number.isFinite(metric.value)||metric.value<0||metric.kind==='cpu'&&metric.value>100||!Number.isFinite(Date.parse(metric.measuredAt)))throw Error('PC_SAMPLE_INVALID');
          return {kind:metric.kind,unit:metric.unit,target:metric.target,status:'ok',value:metric.value,measuredAt:metric.measuredAt,
            ...(metric.kind==='cpu'?{startedAt:metric.startedAt,intervalMs:metric.intervalMs}:{})};
        }
        return {kind:metric.kind,unit:metric.unit,target:metric.target,status:'unknown',value:null,measuredAt:null,attemptedAt:metric.attemptedAt,reason:metric.reason};
      });
      return transaction(rows=>{
        rows.unshift({scope:scopeKey(scope),queryId:randomUUID(),source:'measured',queriedAt:sample.queriedAt,metrics});
        return () => ({saved:true});
      });
    },
    async append(scope, mode, events) {
      if (!['demo', 'connected'].includes(mode)) throw Error('HISTORY_MODE');
      const queriedAt = clock().toISOString();
      const queryId = randomUUID();
      return transaction(rows => {
        for (const event of events) {
          if (!['access','xdr'].includes(event.kind) || !Number.isFinite(Date.parse(event.at))) throw Error('HISTORY_EVENT');
          rows.push({ scope: scopeKey(scope), mode, queryId, queriedAt, occurredAt: event.at, kind: event.kind });
        }
        return () => ({ saved: events.length, queriedAt });
      });
    },
    read(scope) {
      return transaction(() => rows => rows.filter(row => row.scope === scopeKey(scope)).map(({scope: _scope, ...row}) => row));
    },
    clear(scope, expectedQueryId) {
      return transaction(rows => {
        if(expectedQueryId!==undefined&&!rows.some(row=>row.scope===scopeKey(scope)&&row.queryId===expectedQueryId))throw Error('HISTORY_SCOPE_CHANGED');
        for (let i=rows.length-1;i>=0;i--) if (rows[i].scope === scopeKey(scope)) rows.splice(i,1);
        return () => ({ cleared: true });
      });
    },
  };
}
