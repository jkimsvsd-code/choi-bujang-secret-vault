import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

export const defaultHistoryDirectory = () => join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Keshev', 'history');
// No source identifiers, summaries, evidence, credentials or free text are persisted.
export function createHistoryStore({ directory = defaultHistoryDirectory(), clock = () => new Date() } = {}) {
  const file = join(directory, 'queries.json');
  const lock = join(directory, 'queries.lock');
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
