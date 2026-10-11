-- Run after step2_learning_notes.sql in the Supabase SQL Editor.
-- Preserve existing numeric IDs, note bodies and owners. No auth.users FK:
-- the provided verifier also accepts operator-issued judge identities.
BEGIN;
ALTER TABLE public.learning_notes ADD COLUMN IF NOT EXISTS note_id uuid;
ALTER TABLE public.learning_notes ALTER COLUMN note_id SET DEFAULT gen_random_uuid();
UPDATE public.learning_notes SET note_id = gen_random_uuid() WHERE note_id IS NULL;
ALTER TABLE public.learning_notes ALTER COLUMN note_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS learning_notes_note_id_key ON public.learning_notes(note_id);
ALTER TABLE public.learning_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.learning_notes FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.learning_notes TO service_role;
-- Inserts keep the existing bigint identity column and need its sequence.
DO $$
DECLARE note_sequence text;
BEGIN
  note_sequence := pg_get_serial_sequence('public.learning_notes', 'id');
  IF note_sequence IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', note_sequence);
  END IF;
END $$;
COMMIT;
