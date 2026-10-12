import { createClient } from '@supabase/supabase-js';

// Request-scoped Auth client: never share one user's session with another request.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  }
  if (!/^application\/json(?:;|$)/i.test(req.headers?.['content-type'] ?? '')) {
    return res.status(415).json({ error: 'JSON 요청이 필요합니다.' });
  }
  let input;
  try { input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: '잘못된 요청입니다.' }); }
  const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
  if (!input || !['login', 'refresh', 'logout'].includes(input.action)
      || (input.action === 'login' && (!text(input.email, 320) || !text(input.password, 4096)))
      || (input.action === 'refresh' && !text(input.refresh_token, 8192))
      || (input.action === 'logout' && !/^Bearer [A-Za-z0-9._-]{1,8192}$/.test(req.headers?.authorization ?? ''))) {
    return res.status(400).json({ error: '잘못된 요청입니다.' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: '서버 로그인 설정을 확인해 주세요.' });
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    if (input.action === 'logout') {
      const { error } = await client.auth.admin.signOut(req.headers.authorization.slice(7), 'local');
      if (error && ![401, 403, 404].includes(error.status)) throw error;
      return res.status(200).json({ session: null });
    }
    const { data, error } = input.action === 'login'
      ? await client.auth.signInWithPassword({ email: input.email, password: input.password })
      : await client.auth.refreshSession({ refresh_token: input.refresh_token });
    if (error || !data?.session) {
      return res.status(error?.status === 429 ? 429 : 401).json({
        error: error?.status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.' : '로그인 확인에 실패했습니다. 다시 로그인해 주세요.',
      });
    }
    const { access_token, refresh_token, expires_at, user } = data.session;
    // Only the user's session is returned, never the server key or Auth metadata.
    return res.status(200).json({ session: { access_token, refresh_token, expires_at, user: { id: user.id } } });
  } catch {
    return res.status(503).json({ error: '로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' });
  }
}
