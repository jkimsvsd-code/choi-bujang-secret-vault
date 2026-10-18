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
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !secretKey) {
    return res.status(500).json({ error: 'Server configuration unavailable' });
  }
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secretKey });
    const identity = await verifyLogin(authorization);
    if (!identity || !UUID.test(identity.userId ?? '')) {
      return res.status(401).json({ error: 'Authentication failed' });
    }
  } catch {
    return res.status(401).json({ error: 'Authentication failed' });
  }
  // No notices have been created yet. Do not reuse or reclassify existing notes.
  return res.status(200).json([]);
}
