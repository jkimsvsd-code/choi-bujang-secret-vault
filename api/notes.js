import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    return res.status(500).json({
      error: 'Server configuration unavailable',
    });
  }

  try {
    const supabase = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabase
      .from('learning_notes')
      .select('title, content')
      .eq('sample_marker', 'SAMPLE_NOTE_1')
      .order('id', { ascending: true });

    if (error) {
      return res.status(500).json({
        error: 'Notes could not be loaded',
      });
    }

    return res.status(200).json({
      sampleMarker: 'SAMPLE_NOTE_1',
      notes: data,
    });
  } catch {
    return res.status(500).json({
      error: 'Notes could not be loaded',
    });
  }
}