# 자료실 자체 기기 승인 계약 v1

이 API는 이번 자료실에서 구현한 서버 계약입니다. ALEPH 운영 엔진 계약이나 공식 기기 등록부를 대체하지 않습니다. 엔진의 deviceRegistered를 브라우저 입력으로 만들지 않습니다.

## 운영 적용 전

1. supabase/step11_device_approval.sql을 Supabase SQL Editor에서 실행합니다. 생성되는 세 테이블은 기존 메모·정책과 독립적이며 anon/authenticated 접근을 허용하지 않습니다. 앱 서버에는 승인 상태 갱신 권한을 주지 않습니다.
2. 기존 SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY를 사용합니다. 값을 코드·채팅·제출물에 복사하지 않습니다. 새 비밀키는 필요하지 않습니다.
3. aleph.config.json의 publicAppUrl이 RP origin입니다. 현재 https://choi-bujang-secret-vault-okfv.vercel.app 에서만 기기 등록/확인합니다. 개별 Preview URL에서는 origin 검사로 거부됩니다.
4. 보안 장치의 PIN/생체 확인은 사용자가 직접 합니다. 동기화 패스키는 거부되며 장치 연결형 FIDO2 보안 키 등 단일 기기 자격 증명이 필요합니다. 장치 확인 결과만으로 하드웨어 제조사/진위를 보증하지는 않습니다.

## POST /api/device

유효한 기존 로그인 Authorization Bearer, Content-Type application/json, 정확한 Origin이 필요합니다. 토큰은 메모리에서만 전송합니다. 모든 응답은 no-store입니다.

| action | 추가 입력 | 성공 응답 |
|---|---|---|
| register-options | 없음 | challengeId, options (유효 2분) |
| register-verify | challengeId, WebAuthn response | 202 status: pending |
| authenticate-options | 없음 | 승인된 본인 자격 증명의 challengeId, options |
| authenticate-verify | challengeId, WebAuthn response | 200 status: approved, grant, expiresAt |
| status | X-Device-Grant 헤더 | 200 status: approved (서버가 재검증한 경우만) |

challenge는 사용자·로그인 세션·목적과 결합하며 원자적으로 삭제한 뒤 검증하여 재사용하지 못합니다. grant는 난수이며 DB에는 SHA-256만 저장합니다. 사용자·로그인 세션에 묶여 5분 후 만료됩니다. 등록 버튼은 pending만 만들며 일반 API로 승인 상태를 변경할 수 없습니다.

메모/공지/복원/강사 API에도 X-Device-Grant를 전송합니다. 서버는 매 요청 approved 상태와 grant 만료를 읽고 기존 인증·소유자·강사 조건도 적용합니다. 이 grant는 메모리 전용 단기 bearer 증명이며 요청별 서명이나 운영 릴레이 mTLS를 구현한 것으로 간주하지 않습니다.

## 관리자 승인 — 사용자가 직접 수행

로그인한 사용자가 화면의 기기 등록 요청을 마친 다음, 관리자가 공식 SQL Editor에서 대기 항목을 조회합니다. 결과의 사용자 ID를 채팅이나 Git에 복사하지 않습니다.

```sql
select id, owner_id, status, created_at
from public.vault_device_credentials
where status = 'pending' order by created_at desc;
```

사용자와 등록한 보안 장치를 별도로 확인한 뒤, 아래 자리표시자를 SQL Editor 안에서만 실제 값으로 바꿔 한 건을 승인합니다. 일괄 승인하지 않습니다.

```sql
update public.vault_device_credentials set status = 'approved'
where id = '<확인한 자격 증명 ID>'
  and owner_id = '<확인한 사용자 UUID>'::uuid and status = 'pending'
returning status;
```

다음으로 사용자가 승인된 기기 확인을 눌러 보안 장치로 새 서명을 합니다. 정상인 경우에만 자료가 표시됩니다. 회수하려면 관리자가 같은 id/owner_id 한 건의 status를 revoked로 변경합니다. 새 자료 요청은 즉시 거부되며, 화면은 다음 요청의 403 또는 5분 만료에 자료를 지웁니다. 서버 푸시를 통한 즉시 화면 삭제는 구현하지 않았습니다.

## 결과 구분

DB 설치·실기기 등록·관리자 승인·배포 후 정상 CRUD·철회 확인·실제 심판 판정은 실행한 후에만 완료로 기록합니다. 모의 DB와 합성 보안 장치 검사는 운영 검증이 아닙니다.
