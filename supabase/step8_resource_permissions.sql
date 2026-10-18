-- Supabase SQL Editor에서 프로젝트 관리자로 실행합니다.
-- 기존 learning_notes와 사용자·자료는 변경하지 않습니다.
-- 동명 테이블이 있으면 중단합니다. 기존 테이블을 덮어쓰지 마세요.
BEGIN;

CREATE TABLE public.vault_instructors (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  active boolean NOT NULL DEFAULT false
);
CREATE TABLE public.learning_notices (
  notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 20000),
  published boolean NOT NULL DEFAULT false
);
CREATE TABLE public.instructor_materials (
  material_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 20000)
);

ALTER TABLE public.vault_instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_materials ENABLE ROW LEVEL SECURITY;

-- 브라우저와 일반 로그인에는 테이블 권한과 RLS 허용 정책을 주지 않습니다.
REVOKE ALL PRIVILEGES ON TABLE public.vault_instructors,
  public.learning_notices, public.instructor_materials
  FROM PUBLIC, anon, authenticated, service_role;
-- 앱 서버는 권한표를 변경할 수 없습니다. 권한 부여는 DB 관리자만 합니다.
GRANT SELECT ON TABLE public.vault_instructors, public.instructor_materials TO service_role;
GRANT SELECT ON TABLE public.learning_notices TO service_role;
GRANT UPDATE (title, content) ON public.learning_notices TO service_role;

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['vault_instructors', 'learning_notices', 'instructor_materials']
  LOOP
    IF has_table_privilege('anon', 'public.' || target, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_table_privilege('authenticated', 'public.' || target, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege('anon', 'public.' || target, 'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_any_column_privilege('authenticated', 'public.' || target, 'SELECT,INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'unexpected_client_privilege';
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || target, 'SELECT') THEN
      RAISE EXCEPTION 'missing_server_read_privilege';
    END IF;
  END LOOP;
  IF has_table_privilege('service_role', 'public.vault_instructors', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege('service_role', 'public.vault_instructors', 'INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'unexpected_server_permission_write';
  END IF;
  IF NOT has_column_privilege('service_role', 'public.learning_notices', 'title', 'UPDATE')
    OR NOT has_column_privilege('service_role', 'public.learning_notices', 'content', 'UPDATE') THEN
    RAISE EXCEPTION 'missing_notice_update_privilege';
  END IF;
END $$;

COMMIT;
-- 재실행하면 동명 테이블 오류로 중단합니다. 오류 시 ROLLBACK 후 첫 오류를 확인하세요.
-- 강사 계정을 자동 등록하지 않습니다. 권한표는 빈 상태로 생성됩니다.
-- DB 관리자가 Table Editor에서 vault_instructors에 대상 auth.users의 ID와 active=true를
-- 직접 등록합니다. 실제 사용자 ID를 저장소나 채팅에 복사하지 마세요.
-- active=false로 변경하면 다음 API 요청부터 강사 접근이 거부됩니다.
-- 공지와 강사 자료는 각각 별도 테이블에 관리자가 추가합니다. 공개할 공지만 published=true.
