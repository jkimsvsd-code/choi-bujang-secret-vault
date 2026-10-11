import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import config from '../aleph.config.json' with { type: 'json' };

let verifyLogin;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const columns = 'note_id,title,content';
const toNote = row => ({ id: row.note_id, title: row.title, body: row.content });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const itemRoute = req.noteItemRoute === true;
  const methods = itemRoute ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST'];
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    return res.status(500).json({
      error: 'Server configuration unavailable',
    });
  }

  let identity;
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secretKey });
    identity = await verifyLogin(authorization);
  } catch {
    return res.status(401).json({ error: 'Authentication failed' });
  }
  if (!identity || !UUID.test(identity.userId ?? '')) {
    return res.status(401).json({ error: 'Authentication failed' });
  }

  const id = itemRoute ? req.query?.id : undefined;
  if (itemRoute && (typeof id !== 'string' || !UUID.test(id))) {
    return res.status(400).json({ error: 'Invalid note ID' });
  }
  let input;
  if (req.method === 'POST' || req.method === 'PUT') {
    try { input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    if (!input || Array.isArray(input) || typeof input !== 'object'
        || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200
        || typeof input.body !== 'string' || !input.body.trim() || input.body.length > 20000
        || (req.method === 'POST' && input.id !== undefined
          && (typeof input.id !== 'string' || !UUID.test(input.id)))) {
      return res.status(400).json({ error: 'Invalid note: title and body required; id must be a UUID' });
    }
  }
  try {
    const supabase = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const table = () => supabase.from('learning_notes');
    if (req.method === 'POST') {
      const noteId = input.id ?? randomUUID();
      const { error } = await table().insert({
        note_id: noteId, owner_id: identity.userId, sample_marker: 'SAMPLE_NOTE_1',
        title: input.title, content: input.body,
      });
      if (error) return res.status(error.code === '23505' ? 409 : 500)
        .json({ error: error.code === '23505' ? 'Note ID already exists' : 'Note could not be saved' });
      return res.status(201).json({ id: noteId });
    }
    if (!itemRoute) {
      const { data, error } = await table().select(columns)
        .eq('owner_id', identity.userId).eq('sample_marker', 'SAMPLE_NOTE_1')
        .order('id', { ascending: true });
      if (error) return res.status(500).json({ error: 'Notes could not be loaded' });
      return res.status(200).json(data.map(toNote));
    }
    // Match the existing owner atomically; bind the updated owner to the
    // verified identity too. Client-supplied ownership fields are ignored.
    let query;
    if (req.method === 'PUT') query = table().update({
      title: input.title, content: input.body, owner_id: identity.userId,
    });
    else if (req.method === 'DELETE') query = table().delete();
    else query = table().select(columns);
    query = query.eq('note_id', id).eq('owner_id', identity.userId)
      .eq('sample_marker', 'SAMPLE_NOTE_1');
    if (req.method !== 'GET') query = query.select(columns);
    const { data, error } = await query.maybeSingle();
    if (error) return res.status(500).json({ error: 'Note operation failed' });
    if (!data) return res.status(404).json({ error: 'Note not found' });
    if (req.method === 'DELETE') return res.status(204).end();
    return res.status(200).json(toNote(data));
  } catch {
    return res.status(500).json({ error: 'Note operation failed' });
  }
}
