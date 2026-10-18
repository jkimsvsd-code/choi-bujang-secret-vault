-- Install once in the official SQL Editor. Does not change existing notes/policies.
BEGIN;
CREATE SCHEMA vault_recovery;
REVOKE ALL ON SCHEMA vault_recovery FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE vault_recovery.target (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  note_id uuid NOT NULL CHECK (note_id = '92cd9cd2-589c-4e18-9e4c-3c9a2bd1aa69'),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE vault_recovery.backup (
  note_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  sample_marker text NOT NULL CHECK (sample_marker = 'SAMPLE_NOTE_1'),
  title text NOT NULL,
  content text NOT NULL
);
CREATE TABLE vault_recovery.audit (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  note_id uuid NOT NULL,
  content_hash text NOT NULL,
  action text NOT NULL CHECK (action = 'restore_verified')
);
ALTER TABLE vault_recovery.target ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_recovery.backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_recovery.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA vault_recovery FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA vault_recovery FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.restore_b_fixture_note(p_caller uuid, p_id uuid, p_apply boolean, p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  t vault_recovery.target%ROWTYPE;
  b vault_recovery.backup%ROWTYPE;
  restored public.learning_notes%ROWTYPE;
  digest text;
BEGIN
  SELECT * INTO t FROM vault_recovery.target WHERE singleton FOR SHARE;
  IF NOT FOUND OR p_caller IS DISTINCT FROM t.owner_id OR p_id IS DISTINCT FROM t.note_id THEN
    RAISE EXCEPTION 'restore_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM vault_recovery.backup WHERE note_id = t.note_id FOR SHARE;
  IF NOT FOUND OR b.note_id IS DISTINCT FROM t.note_id OR b.owner_id IS DISTINCT FROM t.owner_id
    OR b.sample_marker IS DISTINCT FROM 'SAMPLE_NOTE_1' THEN
    RAISE EXCEPTION 'backup_not_verified';
  END IF;
  -- Hash both title and content using an unambiguous canonical JSON array.
  digest := encode(sha256(convert_to(jsonb_build_array(b.title, b.content)::text, 'UTF8')), 'hex');
  IF digest IS DISTINCT FROM t.content_hash THEN RAISE EXCEPTION 'backup_not_verified'; END IF;
  IF p_apply IS NULL THEN RAISE EXCEPTION 'invalid_restore_mode'; END IF;
  IF p_apply THEN
    IF p_hash IS DISTINCT FROM t.content_hash THEN RAISE EXCEPTION 'confirmation_mismatch'; END IF;
    -- This statement inserts a deleted note or updates this exact B-owned fixture.
    -- A conflicting owner/zone is never overwritten. Every failure rolls back audit and note writes.
    INSERT INTO public.learning_notes AS n (note_id, owner_id, sample_marker, title, content)
    VALUES (b.note_id, b.owner_id, b.sample_marker, b.title, b.content)
    ON CONFLICT (note_id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content
      WHERE n.owner_id = t.owner_id AND n.sample_marker = 'SAMPLE_NOTE_1'
    RETURNING * INTO restored;
    IF NOT FOUND OR restored.note_id IS DISTINCT FROM b.note_id
      OR restored.owner_id IS DISTINCT FROM b.owner_id
      OR encode(sha256(convert_to(jsonb_build_array(restored.title, restored.content)::text, 'UTF8')), 'hex')
        IS DISTINCT FROM digest THEN RAISE EXCEPTION 'restored_note_not_verified'; END IF;
    INSERT INTO vault_recovery.audit (note_id, content_hash, action)
      VALUES (t.note_id, digest, 'restore_verified');
  END IF;
  RETURN jsonb_build_object('id', t.note_id, 'ownerMatches', true, 'idMatches', true,
    'hashMatches', true, 'contentHash', digest, 'restored', p_apply);
END;
$$;
REVOKE ALL ON FUNCTION public.restore_b_fixture_note(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_b_fixture_note(uuid, uuid, boolean, text) TO service_role;
COMMIT;
