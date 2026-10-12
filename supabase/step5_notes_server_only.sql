-- 5단계 제안 SQL: 검토 후 학습 DB의 SQL Editor에서 소유자/관리자로 실행.
-- 대상은 public.learning_notes 하나입니다. 데이터, RLS 정책, 서버 설정은 유지합니다.
-- 4단계 SQL을 다시 실행하면 authenticated 권한이 재부여되므로 주의하세요.
BEGIN;

-- 1. 적용 전 명시적 테이블/컬럼 권한. PUBLIC은 grantee = 0입니다.
SELECT 'before' AS phase, 'table' AS scope, NULL::text AS column_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(a.grantee)::text END AS grantee,
       a.privilege_type
FROM pg_class c
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
WHERE c.oid = 'public.learning_notes'::regclass
UNION ALL
SELECT 'before', 'column', att.attname::text,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(a.grantee)::text END,
       a.privilege_type
FROM pg_attribute att
CROSS JOIN LATERAL aclexplode(att.attacl) a
WHERE att.attrelid = 'public.learning_notes'::regclass
  AND att.attnum > 0 AND NOT att.attisdropped;

-- 실제 권한은 상속 권한도 포함합니다. service_role의 기존 CRUD 권한도 확인합니다.
SELECT 'before' AS phase, r.role_name, p.privilege,
       has_table_privilege(r.role_name, 'public.learning_notes', p.privilege) AS table_allowed,
       CASE WHEN p.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
            THEN has_any_column_privilege(r.role_name, 'public.learning_notes', p.privilege)
       END AS any_column_allowed
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
ORDER BY r.role_name, p.privilege;

-- 2. 이 테이블의 직접 권한만 회수합니다. CASCADE는 사용하지 않습니다.
REVOKE ALL PRIVILEGES ON TABLE public.learning_notes
FROM PUBLIC, anon, authenticated;

-- 3. 적용 후 명시적 권한: PUBLIC/anon/authenticated 항목은 없어야 합니다.
SELECT 'after' AS phase, 'table' AS scope, NULL::text AS column_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(a.grantee)::text END AS grantee,
       a.privilege_type
FROM pg_class c
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
WHERE c.oid = 'public.learning_notes'::regclass
UNION ALL
SELECT 'after', 'column', att.attname::text,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(a.grantee)::text END,
       a.privilege_type
FROM pg_attribute att
CROSS JOIN LATERAL aclexplode(att.attacl) a
WHERE att.attrelid = 'public.learning_notes'::regclass
  AND att.attnum > 0 AND NOT att.attisdropped;

-- anon/authenticated: 모두 false (컬럼 권한이 없는 종류의 NULL은 정상).
-- service_role: SELECT/INSERT/UPDATE/DELETE의 table_allowed는 true.
SELECT 'after' AS phase, r.role_name, p.privilege,
       has_table_privilege(r.role_name, 'public.learning_notes', p.privilege) AS table_allowed,
       CASE WHEN p.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
            THEN has_any_column_privilege(r.role_name, 'public.learning_notes', p.privilege)
       END AS any_column_allowed
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
ORDER BY r.role_name, p.privilege;

-- 예상 밖의 상속/컬럼 권한 또는 서버 CRUD 권한 누락 시 전체 변경을 취소합니다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated')) r(role_name)
    WHERE has_table_privilege(r.role_name, 'public.learning_notes',
                             'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege(r.role_name, 'public.learning_notes',
                                  'SELECT,INSERT,UPDATE,REFERENCES')
  ) THEN
    RAISE EXCEPTION '직접 접근 권한이 남았습니다. 역할 상속과 ACL을 확인하세요.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(privilege)
    WHERE NOT has_table_privilege('service_role', 'public.learning_notes', p.privilege)
  ) THEN
    RAISE EXCEPTION '서버 역할의 기존 CRUD 권한을 확인하세요.';
  END IF;
END $$;

COMMIT;
-- 오류 시 같은 SQL 세션에서 ROLLBACK; 실행 후 첫 오류를 확인하세요.
-- 사후 재점검은 위 3번의 SELECT 두 개만 실행하면 됩니다.
