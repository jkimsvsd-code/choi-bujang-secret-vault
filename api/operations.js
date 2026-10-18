import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { requireDeviceApproval } from '../src/device-access.mjs';
import { RULE_IDS } from '../src/decider.mjs';
import config from '../aleph.config.json' with { type: 'json' };
let verifier;
const TARGET = '92cd9cd2-589c-4e18-9e4c-3c9a2bd1aa69';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, error) => res.status(status).json({ error });
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return fail(405, 'method_not_allowed'); }
  if (!req.headers?.authorization) return fail(401, 'authentication_required');
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail(503, 'operations_unavailable');
  let identity;
  try { verifier ??= createLoginVerifier({ config, supabaseSecretKey: key }); identity = await verifier(req.headers.authorization); }
  catch { return fail(401, 'authentication_failed'); }
  if (!identity || identity.kind !== 'student' || !/^[0-9a-f-]{36}$/i.test(identity.userId ?? '')) return fail(403, 'student_required');
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    if (!await requireDeviceApproval(req, res, db, identity)) return;
    // Read-only preview uses the existing owner check. Never read backup tables or apply a restore.
    let recovery = { status: 'unavailable', version: null, reason: 'preview_failed', execution: 'not_run' };
    try {
      const { data, error } = await db.rpc('restore_b_fixture_note', {
        p_caller: identity.userId, p_id: TARGET, p_apply: false, p_hash: null,
      });
      if (error) recovery.reason = error.code === '42501' ? 'not_authorized' : 'preview_failed';
      else if (data?.id === TARGET && data.ownerMatches === true && data.idMatches === true
        && data.hashMatches === true && data.restored === false && /^[a-f0-9]{64}$/.test(data.contentHash ?? '')) {
        recovery = { status: 'verified_preview', version: data.contentHash, reason: null, execution: 'not_run' };
      }
    } catch { /* No raw database errors or response payloads enter logs. */ }
    const snapshot = {
      schema: 1, snapshotId: randomUUID(), checkedAt: new Date().toISOString(),
      rules: { status: 'configured', count: RULE_IDS.length, ids: [...RULE_IDS], verdictCount: null },
      detection: { status: 'not_connected', count: null },
      revocation: { status: 'not_connected', count: null },
      recovery,
    };
    // This allowlisted object is both the API response and the redacted server record.
    // No request headers, subject IDs, device IDs, note titles/bodies or DB errors.
    console.info(JSON.stringify({ event: 'operations_summary', ...snapshot }));
    return res.status(200).json(snapshot);
  } catch { return fail(503, 'operations_unavailable'); }
}
