-- Learning data only. Replace placeholders in Supabase SQL Editor, not Git.
-- Run after step3_notes_crud.sql. This does not change grants or RLS policies.
BEGIN;

DO $$
DECLARE
  a_email text := 'A_EMAIL_HERE';
  b_email text := 'B_EMAIL_HERE';
  a_id uuid;
  b_id uuid;
  sample record;
  matched_count integer;
BEGIN
  SELECT id INTO STRICT a_id
  FROM auth.users
  WHERE lower(email) = lower(trim(a_email));

  SELECT id INTO STRICT b_id
  FROM auth.users
  WHERE lower(email) = lower(trim(b_email));

  IF a_id = b_id THEN
    RAISE EXCEPTION 'A와 B는 서로 다른 계정이어야 합니다.';
  END IF;

  LOCK TABLE public.learning_notes IN SHARE ROW EXCLUSIVE MODE;

  FOR sample IN
    SELECT *
    FROM (VALUES
      ('과제', '실습용 가상 과제 기록'),
      ('포트폴리오', '실습용 가상 포트폴리오 기록'),
      ('아침 리추얼', '실습용 가상 리추얼 기록'),
      ('훈련 행정 자료', '실습용 가상 행정 기록')
    ) AS v(title, content)
  LOOP
    SELECT count(*) INTO matched_count
    FROM public.learning_notes
    WHERE sample_marker = 'SAMPLE_NOTE_1'
      AND title = sample.title
      AND content = sample.content;

    IF matched_count <> 1 THEN
      RAISE EXCEPTION '기존 가상 메모가 없거나 중복되어 중단합니다.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.learning_notes
      WHERE sample_marker = 'SAMPLE_NOTE_1'
        AND title = sample.title
        AND content = sample.content
        AND owner_id IS NOT NULL
        AND owner_id <> a_id
    ) THEN
      RAISE EXCEPTION '기존 가상 메모에 다른 소유자가 있어 중단합니다.';
    END IF;

    UPDATE public.learning_notes
    SET owner_id = a_id
    WHERE sample_marker = 'SAMPLE_NOTE_1'
      AND title = sample.title
      AND content = sample.content;
  END LOOP;

  INSERT INTO public.learning_notes
    (owner_id, sample_marker, title, content)
  SELECT
    b_id,
    'SAMPLE_NOTE_1',
    'B 계정 공개 시험 메모',
    '접근 통제 학습용 가상 자료입니다. 실제 개인정보는 없습니다.'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.learning_notes
    WHERE owner_id = b_id
      AND sample_marker = 'SAMPLE_NOTE_1'
      AND title = 'B 계정 공개 시험 메모'
      AND content =
        '접근 통제 학습용 가상 자료입니다. 실제 개인정보는 없습니다.'
  );
END $$;

COMMIT;
