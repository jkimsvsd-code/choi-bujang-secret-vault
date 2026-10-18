import { requireDeviceApproval } from '../src/device-access.mjs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import config from '../aleph.config.json' with { type: 'json' };

let verifyLogin;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export default async function handler(req, res) {
  // Resource identity is assigned by the server, not supplied by the caller.
  req.resourceId = 'notices';
  res.setHeader('X-Resource-Id', req.resourceId);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const deny = (status, reason, error) => {
    console.warn(`api_denied resource=notices reason=${reason}`);
    res.setHeader('X-Denial-Reason', reason);
    return res.status(status).json({ error });
  };
  // Client role fields cannot enable writing through this read-only endpoint.
  // Instructor edits use the separately authorized /api/admin/notices/:id route.
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return deny(405, 'notices_read_only', 'Method not allowed');
  }
  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization) {
    return deny(401, 'authentication_required', 'Authentication required');
  }
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !secretKey) {
    return res.status(500).json({ error: 'Server configuration unavailable' });
  }
  let identity;
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secretKey });
    identity = await verifyLogin(authorization);
    if (!identity || !UUID.test(identity.userId ?? '')) {
      return deny(401, 'authentication_failed', 'Authentication failed');
    }
  } catch {
    return deny(401, 'authentication_failed', 'Authentication failed');
  }
  try {
    const db = createClient(process.env.SUPABASE_URL, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    if (!await requireDeviceApproval(req, res, db, identity)) return;
    const { data, error } = await db.from('learning_notices').select('notice_id,title,content')
      .eq('published', true).order('notice_id', { ascending: true });
    if (error) return deny(503, 'notices_unavailable', 'Notices unavailable');
    return res.status(200).json(data.map(row => ({ id: row.notice_id, title: row.title, body: row.content })));
  } catch { return deny(503, 'notices_unavailable', 'Notices unavailable'); }
}
