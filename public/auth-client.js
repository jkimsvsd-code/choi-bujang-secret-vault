// Browser talks only to our server. No Supabase project key or SDK is shipped.
export function createAuthClient() {
  const storageKey = 'vault-session-v1';
  let listener;
  let timer;
  let memory = null;
  const read = () => {
    try { return JSON.parse(localStorage.getItem(storageKey)); }
    catch { return memory; }
  };
  const notify = session => {
    clearTimeout(timer);
    listener?.('SESSION', session);
    if (session) timer = setTimeout(() => void restore(),
      Math.max(1000, (session.expires_at * 1000 - Date.now() - 60000)));
  };
  const save = session => {
    memory = session;
    try {
      if (session) localStorage.setItem(storageKey, JSON.stringify(session));
      else localStorage.removeItem(storageKey);
    } catch { /* Keep a working in-memory session if storage is unavailable. */ }
    notify(session);
  };
  // Serialize refresh, login and logout across tabs to avoid refresh-token races.
  let pending = Promise.resolve();
  const locked = task => {
    const run = () => navigator.locks ? navigator.locks.request(storageKey, task) : task();
    const result = pending.then(run, run);
    pending = result.catch(() => {});
    return result;
  };
  async function request(action, payload = {}, token) {
    const response = await fetch('/api/auth', {
      method: 'POST', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, ...payload }), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || '로그인 요청에 실패했습니다.');
      error.status = response.status;
      throw error;
    }
    return data.session;
  }
  async function restore() {
    return locked(async () => {
      const session = read();
      if (!session?.refresh_token || !session?.access_token || !Number.isFinite(session.expires_at)) {
        save(null); return;
      }
      if (session.expires_at * 1000 > Date.now() + 60000) { notify(session); return; }
      try { save(await request('refresh', { refresh_token: session.refresh_token })); }
      catch (error) {
        if (error.status === 401 || error.status === 400) save(null);
        else {
          notify(session.expires_at * 1000 > Date.now() ? session : null);
          clearTimeout(timer);
          timer = setTimeout(() => void restore(), 10000);
        }
      }
    });
  }
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) void restore();
  });
  window.addEventListener('focus', () => void restore());
  return { auth: {
    onAuthStateChange(callback) { listener = callback; void restore(); },
    signInWithPassword(credentials) {
      return locked(async () => {
        try {
          const session = await request('login', credentials);
          save(session);
          return { data: { session }, error: null };
        } catch (error) { return { data: { session: null }, error }; }
      });
    },
    signOut() {
      return locked(async () => {
        try {
          const session = read();
          if (session) await request('logout', {}, session.access_token);
          save(null);
          return { error: null };
        } catch (error) { return { error }; }
      });
    },
  } };
}
