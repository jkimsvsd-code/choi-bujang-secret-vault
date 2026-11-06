import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { createSocket } from 'node:dgram';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { decide } from '../brute-force/decide.mjs';
import { parseNativeSyslog } from './native-syslog.mjs';

const host = '127.0.0.1';
const port = Number(process.env.CLOUDXDR_PORT || 8787);
const origin = 'http://' + host + ':' + port;
const db = new DatabaseSync(process.env.CLOUDXDR_DB || 'cloudxdr.sqlite');
const page = readFileSync(new URL('./console.html', import.meta.url));
const windowMs = 5 * 60 * 1000;
const ttlMs = 15 * 60 * 1000;
db.exec(
  'PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;' +
  'CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, ip TEXT NOT NULL, opened INTEGER NOT NULL, last INTEGER NOT NULL, hits INTEGER NOT NULL);' +
  'CREATE INDEX IF NOT EXISTS incidents_ip_last ON incidents(ip,last);' +
  'CREATE TABLE IF NOT EXISTS events (event_key TEXT PRIMARY KEY, incident TEXT NOT NULL REFERENCES incidents(id));' +
  'CREATE TABLE IF NOT EXISTS candidates (id TEXT PRIMARY KEY, incident TEXT NOT NULL REFERENCES incidents(id), expires INTEGER NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL);' +
  'CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, at INTEGER NOT NULL, incident TEXT NOT NULL REFERENCES incidents(id), action TEXT NOT NULL, detail TEXT NOT NULL);'
);
const query = sql => db.prepare(sql);
const audit = (now, id, action, detail) =>
  query('INSERT INTO audit(at,incident,action,detail) VALUES (?,?,?,?)').run(now, id, action, detail);
transaction(() => {
  const columns = query('PRAGMA table_info(incidents)').all().map(column => column.name);
  if (!columns.includes('kind')) db.exec("ALTER TABLE incidents ADD COLUMN kind TEXT NOT NULL DEFAULT 'login'");
  if (!columns.includes('correlation')) db.exec("ALTER TABLE incidents ADD COLUMN correlation TEXT NOT NULL DEFAULT ''");
  db.exec('CREATE TABLE IF NOT EXISTS observations (event_key TEXT PRIMARY KEY REFERENCES events(event_key), source TEXT NOT NULL, evidence TEXT NOT NULL)');
});
function transaction(work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function expire(now) {
  const rows = query("UPDATE candidates SET status='expired' WHERE status='pending' AND expires<=? RETURNING id,incident").all(now);
  for (const row of rows) audit(now, row.incident, 'candidate_expired', row.id);
}
function ingest(alert, source = 'Wazuh Manager') {
  const native = alert?.native_syslog ? parseNativeSyslog(alert.native_syslog.text, alert.native_syslog.peer) : null;
  if (alert?.native_syslog && !native) fail(422, '지원하는 실제 장비 syslog 형식이 아닙니다.');
  if (native) alert = { ...alert, data:{...native, kesev_kind:native.kind, event_id:native.eventId} };
  const ip = alert?.data?.srcip;
  const sensor = alert?.manager?.name ?? 'local-wazuh';
  const safeId = /^[\w.-]{1,128}$/;
  if (typeof ip !== 'string' || !isIP(ip) ||
      typeof alert?.id !== 'string' || !safeId.test(alert.id) ||
      typeof sensor !== 'string' || !safeId.test(sensor)) {
    fail(422, 'Wazuh id, manager.name 또는 data.srcip 형식을 확인하세요.');
  }
  const groups = Array.isArray(alert.rule?.groups) ? alert.rule.groups : [];
  const description = typeof alert.rule?.description === 'string' ? alert.rule.description.slice(0, 4096) : '';
  const negative = /실패(?:가)?\s*(?:없|0\s*건)|(?:login|authentication)\s+success/i.test(description);
  const loginFailure = !negative && (groups.includes('authentication_failed') ||
    groups.includes('authentication_failures') ||
    /(?:failed password|invalid password|authentication fail(?:ed|ure)|failed login|login fail(?:ed|ure)|로그인\s*실패)/i.test(description));
  const network = alert?.data?.kesev_kind === 'network';
  const device = native?.kind === 'device';
  let evidence;
  if (network) {
    const data = alert.data;
    const validPort = value => /^(0|[1-9]\d{0,4})$/.test(String(value)) && Number(value) <= 65535;
    if (typeof data.dstip !== 'string' || !isIP(data.dstip) || !validPort(data.srcport) || !validPort(data.dstport) ||
        !['UDP', 'TCP'].includes(data.protocol) || !['allow', 'deny', 'drop'].includes(data.action) ||
        typeof data.event_id !== 'string' || !safeId.test(data.event_id)) {
      fail(422, '네트워크 로그의 IP, 포트, 프로토콜, 행위 또는 이벤트 ID를 확인하세요.');
    }
    evidence = { ...native, eventId:data.event_id, srcip:ip, dstip:data.dstip, srcport:Number(data.srcport),
      dstport:Number(data.dstport), protocol:data.protocol, action:data.action };
  }
  if (device) evidence = native;
  if (!loginFailure && !network && !device) fail(422, '지원하는 로그인 실패 또는 장비 로그가 아닙니다.');
  const kind = device ? 'device' : network ? 'network' : 'login';
  const correlation = device ? native.eventCode : network ? [ip, evidence.dstip, evidence.dstport, evidence.protocol].join('/') : '';
  const verdict = decide(alert);
  const eventKey = sensor + '/' + alert.id;
  const now = Date.now();
  return transaction(() => {
    expire(now);
    const existing = query('SELECT incident FROM events WHERE event_key=?').get(eventKey);
    if (existing) return { incidentId: existing.incident, duplicate: true };

    const recent = query('SELECT id,hits FROM incidents WHERE ip=? AND kind=? AND correlation=? AND last>=? AND opened>=? ORDER BY last DESC LIMIT 1')
      .get(ip, kind, correlation, now - windowMs, now - windowMs);
    const id = recent?.id ?? randomUUID();
    const hits = (recent?.hits ?? 0) + 1;
    if (recent) {
      query('UPDATE incidents SET last=?,hits=? WHERE id=?').run(now, hits, id);
    } else {
      query('INSERT INTO incidents(id,ip,opened,last,hits,kind,correlation) VALUES (?,?,?,?,?,?,?)').run(id, ip, now, now, hits, kind, correlation);
      audit(now, id, 'incident_created', ip);
    }
    query('INSERT INTO events VALUES (?,?)').run(eventKey, id);
    audit(now, id, 'alert_received', eventKey);
    if (network || device) {
      query('INSERT INTO observations VALUES (?,?,?)').run(eventKey, source, JSON.stringify(evidence));
      audit(now, id, device ? 'device_analyzed' : 'network_analyzed', (device ? evidence.eventCode : evidence.protocol + ' ' + evidence.action) + ' · ' + source);
    }

    if (kind === 'login' && ((verdict.action === 'block' && verdict.confidence >= 0.85) || hits >= 5)) {
      const candidate = query('SELECT id FROM candidates WHERE incident=?').get(id);
      if (!candidate) {
        const candidateId = randomUUID();
        const reason = verdict.action === 'block' ? verdict.reason : '동일 IP에서 5분 안에 로그인 실패 경보 5건';
        query('INSERT INTO candidates VALUES (?,?,?,?,?)').run(candidateId, id, now + ttlMs, reason, 'pending');
        audit(now, id, 'candidate_created', candidateId);
      }
    }
    return { incidentId: id, duplicate: false };
  });
}
function review(id, action) {
  if (!['approve', 'reject'].includes(action)) fail(422, 'approve 또는 reject가 필요합니다.');
  const now = Date.now();
  const updated = transaction(() => {
    expire(now);
    const status = action === 'approve' ? 'simulated' : 'rejected';
    const row = query("UPDATE candidates SET status=? WHERE id=? AND status='pending' RETURNING incident").get(status, id);
    if (!row) return false;
    audit(now, row.incident, action === 'approve' ? 'approved' : 'rejected', '로컬 운영자');
    if (action === 'approve') {
      const { ip } = query('SELECT ip FROM incidents WHERE id=?').get(row.incident);
      audit(now, row.incident, 'simulation_succeeded', ip + ' 차단 모의 실행 완료');
    }
    return true;
  });
  if (!updated) fail(409, '이미 처리되었거나 만료된 후보입니다. 새로고침하세요.');
  return { status: action === 'approve' ? 'simulated' : 'rejected', enforced: false };
}
async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail(415, 'application/json이 필요합니다.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 65536) {
      req.resume();
      fail(413, '경보는 최대 64 KiB까지 접수합니다.');
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'JSON 형식을 확인하세요.'); }
}
const server = createServer(async (req, res) => {
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.headers.host !== host + ':' + port || (req.headers.origin && req.headers.origin !== origin)) {
      fail(403, '로컬 콘솔 주소에서 접속하세요.');
    }
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        'X-Content-Type-Options': 'nosniff' });
      return res.end(page);
    }
    if (req.method === 'GET' && req.url === '/api/incidents') {
      return json(200, transaction(() => {
        expire(Date.now());
        return query('SELECT * FROM incidents ORDER BY last DESC LIMIT 100').all();
      }));
    }
    const incident = /^\/api\/incidents\/([0-9a-f-]{36})$/.exec(req.url);
    if (req.method === 'GET' && incident) {
      return json(200, transaction(() => {
        expire(Date.now());
        const id = incident[1];
        const row = query('SELECT * FROM incidents WHERE id=?').get(id);
        if (!row) fail(404, '사건을 찾을 수 없습니다.');
        const observations = query('SELECT o.source,o.evidence FROM observations o JOIN events e ON e.event_key=o.event_key WHERE e.incident=? ORDER BY o.rowid DESC LIMIT 100').all(id)
          .map(observation => ({ source:observation.source, ...JSON.parse(observation.evidence) }));
        return { ...row, observations, candidate: query('SELECT * FROM candidates WHERE incident=?').get(id),
          audit: query('SELECT at,action,detail FROM audit WHERE incident=? ORDER BY seq').all(id) };
      }));
    }
    if (req.method === 'POST' && req.url === '/api/wazuh') {
      const result = ingest(await readJson(req));
      return json(result.duplicate ? 200 : 201, result);
    }
    const candidate = /^\/api\/candidates\/([0-9a-f-]{36})\/review$/.exec(req.url);
    if (req.method === 'POST' && candidate) {
      return json(200, review(candidate[1], (await readJson(req))?.action));
    }
    fail(404, '경로를 찾을 수 없습니다.');
  } catch (error) {
    if (!error.status) console.error('CloudXDR request failed:', error.code ?? 'internal_error');
    json(error.status ?? 500, { error: error.status ? error.message : '요청 처리에 실패했습니다.' });
  }
});
server.listen(port, host, () => console.log(origin));
if (existsSync('udp.json')) {
  const config = JSON.parse(readFileSync('udp.json', 'utf8'));
  if (typeof config.host !== 'string' || isIP(config.host) !== 4 || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 ||
      !Array.isArray(config.allowedPeers) || !config.allowedPeers.length || !config.allowedPeers.every(peer => typeof peer === 'string' && isIP(peer) === 4)) {
    throw new Error('invalid_udp_config');
  }
  const udp = createSocket('udp4');
  udp.on('error', () => { console.error('UDP syslog receiver failed'); process.exit(1); });
  udp.on('message', (message, peer) => {
    if (message.length > 8192 || !config.allowedPeers.includes(peer.address)) return;
    try {
      const text = message.toString('utf8');
      const native = parseNativeSyslog(text, peer.address);
      if (native) {
        ingest({ id:native.eventId, manager:{name:'udp-' + peer.address},
          native_syslog:{text, peer:peer.address} }, 'UDP direct ' + peer.address + ':' + peer.port);
        return;
      }
      const marker = 'cxdr-fw: ';
      const start = text.indexOf(marker);
      if (start < 0) return;
      const data = JSON.parse(text.slice(start + marker.length));
      if (data.kesev_kind !== 'network') return;
      ingest({ id:data.event_id, manager:{name:'udp-' + peer.address}, data }, 'UDP direct ' + peer.address + ':' + peer.port);
    } catch {
      // Malformed or unsupported datagrams are discarded without printing payloads.
    }
  });
  udp.bind({ address:config.host, port:config.port, exclusive:true });
}
