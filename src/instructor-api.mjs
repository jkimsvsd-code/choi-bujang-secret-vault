import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import config from '../aleph.config.json' with { type: 'json' };

let verifyLogin;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// Called only with an operation constant from the server route wrapper.
export async function handleInstructorResource(req, res, operation) {
  const editNotice = operation === 'edit_notice';
  const resourceId = editNotice ? 'notices' : 'instructor_materials';
  req.resourceId = resourceId;
  res.setHeader('X-Resource-Id', resourceId);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const deny = (status, reason) => {
    console.warn(`api_denied resource=${resourceId} reason=${reason}`);
    res.setHeader('X-Denial-Reason', reason);
    return res.status(status).json({ error: reason });
  };
  if (!['edit_notice', 'read_material'].includes(operation)) return deny(404, 'resource_unavailable');
  const method = editNotice ? 'PUT' : 'GET';
  if (req.method !== method) {
    res.setHeader('Allow', method);
    return deny(405, 'method_not_allowed');
  }
  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization) return deny(401, 'authentication_required');
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) return deny(503, 'authorization_unavailable');
  let identity;
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secretKey });
    identity = await verifyLogin(authorization);
  } catch { return deny(401, 'authentication_failed'); }
  if (!identity || !UUID.test(identity.userId ?? '')) return deny(401, 'authentication_failed');
  // Only our verified Supabase issuer can match local auth.users-backed permissions.
  // The verifier's kind is provenance, NOT an instructor role. Judge IDs cannot match.
  if (identity.kind !== 'student') return deny(403, 'instructor_required');

  try {
    const db = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    // Re-read on every request: neither a client role nor a cached grant is authority.
    const permission = await db.from('vault_instructors').select('user_id,active')
      .eq('user_id', identity.userId).eq('active', true).maybeSingle();
    if (permission.error) return deny(503, 'authorization_unavailable');
    if (permission.data?.user_id !== identity.userId || permission.data?.active !== true) {
      return deny(403, 'instructor_required');
    }
    const id = req.query?.id;
    if (typeof id !== 'string' || !UUID.test(id)) return deny(400, 'invalid_resource_id');
    let query;
    if (editNotice) {
      let input;
      try { input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
      catch { return deny(400, 'invalid_notice'); }
      if (!input || Array.isArray(input) || typeof input.title !== 'string'
        || !input.title.trim() || input.title.length > 200 || typeof input.body !== 'string'
        || !input.body.trim() || input.body.length > 20000) return deny(400, 'invalid_notice');
      // Explicit allowlist: cannot grant roles, change publication, or select another table.
      query = db.from('learning_notices').update({ title: input.title, content: input.body })
        .eq('notice_id', id).select('notice_id,title,content');
    } else {
      query = db.from('instructor_materials').select('material_id,title,content').eq('material_id', id);
    }
    const { data, error } = await query.maybeSingle();
    if (error) return deny(503, 'resource_unavailable');
    if (!data) return deny(404, 'resource_unavailable');
    return res.status(200).json({ id: data[editNotice ? 'notice_id' : 'material_id'], title: data.title, body: data.content });
  } catch { return deny(503, 'authorization_unavailable'); }
}
