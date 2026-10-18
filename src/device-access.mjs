import {createHash} from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export async function requireDeviceApproval(req, res, db, identity) {
  const token = req.headers?.['x-device-grant'];
  const deny = code => { res.setHeader('X-Denial-Reason', code); res.status(403).json({error:code}); return false; };
  if (identity?.kind !== 'student' || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return deny('device_not_approved');
  try {
    const grant = await db.from('vault_device_grants').select('credential_id,expires_at')
      .eq('token_hash',hash(token)).eq('owner_id',identity.userId)
      .eq('session_hash',hash(req.headers.authorization)).gt('expires_at',new Date().toISOString()).maybeSingle();
    if(grant.error || !grant.data) return deny('device_not_approved');
    const credential = await db.from('vault_device_credentials').select('id,status')
      .eq('id',grant.data.credential_id).eq('owner_id',identity.userId).eq('status','approved').maybeSingle();
    if(credential.error || !credential.data || credential.data.status !== 'approved') return deny('device_not_approved');
    return true;
  } catch { return deny('device_not_approved'); }
}
