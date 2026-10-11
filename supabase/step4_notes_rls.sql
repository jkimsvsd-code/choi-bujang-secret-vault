BEGIN;

-- 1. 적용 전: 명시적으로 부여된 테이블 권한
SELECT 'before' AS phase, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'learning_notes'
ORDER BY grantee, privilege_type;

-- 적용 전: PUBLIC·역할 상속 등을 포함한 두 역할의 실제 테이블 권한
SELECT 'before' AS phase, r.role_name, p.privilege,
       has_table_privilege(
         r.role_name, 'public.learning_notes', p.privilege
       ) AS allowed
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name)
CROSS JOIN (VALUES
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
) AS p(privilege)
ORDER BY r.role_name, p.privilege;

-- 교체 전 정책도 확인
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'learning_notes'
ORDER BY policyname;

-- 2. 기존 권한 회수 후 필요한 CRUD 권한만 부여
REVOKE ALL ON TABLE public.learning_notes
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.learning_notes
TO authenticated;

ALTER TABLE public.learning_notes ENABLE ROW LEVEL SECURITY;

-- 3. 이 테이블의 기존 정책만 제거
DO $$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'learning_notes'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.learning_notes',
      existing_policy.policyname
    );
  END LOOP;
END $$;

-- 4. 본인 소유 행만 허용
CREATE POLICY learning_notes_select_own
ON public.learning_notes
FOR SELECT TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY learning_notes_insert_own
ON public.learning_notes
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY learning_notes_update_own
ON public.learning_notes
FOR UPDATE TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY learning_notes_delete_own
ON public.learning_notes
FOR DELETE TO authenticated
USING (auth.uid() = owner_id);

-- 5. 적용 후: 명시적 권한 대조
SELECT 'after' AS phase, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'learning_notes'
ORDER BY grantee, privilege_type;

-- 적용 후: 실제 테이블 권한 대조
SELECT 'after' AS phase, r.role_name, p.privilege,
       has_table_privilege(
         r.role_name, 'public.learning_notes', p.privilege
       ) AS allowed
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name)
CROSS JOIN (VALUES
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
) AS p(privilege)
ORDER BY r.role_name, p.privilege;

-- 예상 밖의 상속 권한 등이 남았다면 전체 변경 취소
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated')) AS r(role_name)
    CROSS JOIN (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) AS p(privilege)
    WHERE has_table_privilege(
      r.role_name, 'public.learning_notes', p.privilege
    ) IS DISTINCT FROM (
      r.role_name = 'authenticated'
      AND p.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    )
  ) THEN
    RAISE EXCEPTION
      '실제 테이블 권한이 예상과 다릅니다. 역할 상속 등을 확인하세요.';
  END IF;
END $$;

-- 최종 RLS 상태와 정책 확인
SELECT relrowsecurity AS rls_enabled
FROM pg_class
WHERE oid = 'public.learning_notes'::regclass;

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'learning_notes'
ORDER BY policyname;

COMMIT;
