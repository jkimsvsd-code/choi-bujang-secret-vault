import { requireDeviceApproval } from '../src/device-access.mjs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import config from '../aleph.config.json' with { type: 'json' };

const TARGET = '92cd9cd2-589c-4e18-9e4c-3c9a2bd1aa69';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
let verifyLogin;

export default async function handler(req, res) {
  req.resourceId = 'notes_restore';
  res.setHeader('X-Resource-Id', 'notes_restore');
  res.setHeader('Cache-Control', 'no-store');
  const deny = (status, reason) => res.status(status).json({ error: reason });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return deny(405, 'method_not_allowed');
  }
  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization) return deny(401, 'authentication_required');
  const url = process.env.SUPABASE_URL, secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) return deny(503, 'restore_unavailable');
  let identity;
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secretKey });
    identity = await verifyLogin(authorization);
  } catch { return deny(401, 'authentication_failed'); }
  if (!identity || !UUID.test(identity.userId ?? '')) return deny(401, 'authentication_failed');
  if (identity.kind !== 'student') return deny(403, 'restore_forbidden');
  let input;
  try { input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return deny(400, 'invalid_restore_request'); }
  if (!input || Array.isArray(input) || typeof input !== 'object'
    || !Object.keys(input).every(key => ['id', 'mode', 'contentHash'].includes(key))
    || input.id !== TARGET || !['preview', 'restore'].includes(input.mode)
    || (input.mode === 'preview' && input.contentHash !== undefined)
    || (input.mode === 'restore' && !/^[a-f0-9]{64}$/.test(input.contentHash ?? ''))) {
    return deny(400, 'invalid_restore_request');
  }
  try {
    const db = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    if (!await requireDeviceApproval(req, res, db, identity)) return;
    const { data, error } = await db.rpc('restore_b_fixture_note', {
      p_caller: identity.userId, p_id: TARGET, p_apply: input.mode === 'restore',
      p_hash: input.mode === 'restore' ? input.contentHash : null,
    });
    if (error) return deny(error.code === '42501' ? 403 : error.code === 'P0001' ? 409 : 503,
      error.code === '42501' ? 'restore_forbidden' : 'restore_not_verified');
    // Do not expose the backup's body, owner ID or raw database errors.
    if (data?.id !== TARGET || data?.ownerMatches !== true || data?.idMatches !== true
      || data?.hashMatches !== true || !/^[a-f0-9]{64}$/.test(data?.contentHash ?? '')
      || data?.restored !== (input.mode === 'restore')
      || (input.mode === 'restore' && data.contentHash !== input.contentHash)) return deny(503, 'restore_not_verified');
    return res.status(200).json({ id: TARGET, ownerMatches: true, idMatches: true,
      hashMatches: true, contentHash: data.contentHash, restored: data.restored });
  } catch { return deny(503, 'restore_unavailable'); }
}
