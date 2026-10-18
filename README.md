# Choi Bujang Secret Vault

Vercel, GitHub, Supabase로 가상 메모 자료실을 만들고 단계별로 접근 통제를 추가하는 알레프 방어전 실습 프로젝트입니다. 실제 개인정보나 민감한 자료는 사용하지 않습니다.

**현재 진행: 10단계 복구 API 구현 및 SQL Editor의 실제 DB 복원 확인 완료. B 로그인 POST API·배포·심판 검증은 미실행. 설정 단계는 아직 9입니다.**

## 10단계 B 임시 메모 한 건 복원

- 지정 ID: `92cd9cd2-589c-4e18-9e4c-3c9a2bd1aa69`. B 임시 가상 메모와 비공개 사본이 실제 DB에 생성된 것을 확인했습니다. 실제 계정 ID·이메일·본문은 README에 기록하지 않습니다.
- 서비스: `notes_restore`. 경로: **`POST /api/restore-note`**. 인증된 Supabase 시험 계정 B만 DB에 고정된 복구 대상을 요청할 수 있습니다. 본문은 미리보기 `{ "id": "92cd9cd2-589c-4e18-9e4c-3c9a2bd1aa69", "mode": "preview" }`, 확인 후 복원은 같은 ID에 `mode: "restore"`, 미리보기의 `contentHash`를 전달합니다. 로그인 토큰은 기존 SDK 세션으로 전달하고 복사·기록하지 않습니다.
- 기존 `notes` 서비스, 판정기와 `allowedRoutes`는 유지합니다. 이 서버 전용 POST는 기존 판정기 허용 경로에 포함되지 않습니다. 운영 엔진 연결이나 심판 통과를 의미하지 않습니다.
- Supabase → SQL Editor에서 `supabase/step10_note_restore.sql` 설치 결과를 확인했습니다. 사용자가 공식 편집기에 시험 B 이메일을 직접 입력해 임시 메모·비공개 사본·고정 ID/소유자/해시를 생성했습니다. 설치·준비 SQL은 다시 실행하지 않습니다. 실제 계정 정보와 생성된 본문은 저장소에 넣지 않습니다.
- 비공개 사본은 공개 API 스키마 밖의 `vault_recovery.backup`, 기준은 `vault_recovery.target`에 보관합니다. 일반 사용자·앱 서버의 직접 테이블 접근은 회수하며 서버 역할에 검증 함수 실행만 부여합니다. 기존 메모 접근 정책은 바꾸지 않습니다.
- 복원은 사본의 ID·소유자·제목/본문 SHA-256을 기준과 대조합니다. 해시는 PostgreSQL의 `jsonb_build_array(title, content)::text` UTF-8 바이트 기준입니다. 사본 누락·변조·다른 소유자·다른 ID·확인 해시 불일치는 중단합니다. 삭제된 한 건은 같은 UUID로 재생성하며, 남아 있는 건은 같은 B 소유·가상 메모일 때 제목/본문만 복원합니다. 숫자형 내부 행 ID는 재생성될 수 있습니다.
- 결과의 `idMatches`, `ownerMatches`, `hashMatches`가 모두 true이고 `contentHash`가 미리보기와 같아야 합니다. 응답에는 실제 소유자 ID·본문을 넣지 않습니다. 복원 후 대조와 `vault_recovery.audit` 추가 기록이 같은 트랜잭션 안에서 수행되며 실패하면 전부 롤백합니다. 다른 메모와 기존 감사 행은 삭제·갱신하지 않습니다.
- 로컬 명령: `node --test test/restore-note.test.mjs`. 정상은 B의 지정 메모 미리보기/복원 200, 거부는 무인증 401·위조 입력/다른 ID 400·다른 계정 403·사본/해시 불일치 409입니다. API 모의 검사이며 실제 DB 결과와 구분합니다.
- 2026-10-18 실제 DB 확인: SQL Editor에서 지정 메모의 복원 함수를 실행하고 커밋했습니다. 결과는 `restore_committed`, `id_ok=true`, `owner_ok=true`, `hash_ok=true`입니다. 같은 트랜잭션에서 다른 메모·기존 감사 행·RLS 정책 정의가 그대로인지 대조했고 감사 행 1건 추가를 확인했습니다. 기존 메모 한 건에 대한 복원이며 삭제 후 재생성 검증은 아닙니다. 관리자 SQL 실행 결과로서 B 로그인 POST API·배포·심판 결과와 구분합니다.
- 이전 정책 사본·시험 정책 복원 도구는 유지합니다. 아래 9단계 기록은 이전 저장점입니다.

## 9단계 저장점

- `detect(events)`는 `at`, `method`, `identity.sub`만 읽습니다. 같은 주체의 GET을 시각순으로 정렬해 어느 10분 구간에서든 120건을 넘으면 `{action: "propose_revocation", reasonCode: "burst_read", subject}`만 반환하고 그 밖에는 `{action: "observe"}`만 반환합니다. 정확히 120건은 정상이며 다른 주체·10분 밖 사건은 합산하지 않습니다. 실제 회수 API나 기기 권한은 변경하지 않았습니다.
- 탐지 가상 검사 6개, 판정기 가상 검사 4개와 관련 테스트 10개, 추가 계약 검사 1,296개를 통과했습니다. 검사 범위에서 계약 밖 속성 접근이 없고 응답 다섯 항목·요청 ID·RULE_IDS 포함 여부를 확인했습니다. 정상 등록 기기 가상 요청은 allow입니다. 실제 정상 기기 유지·접속 회수·심판 결과와 구분합니다.
- 원격 저장소를 새로 clone해 `npm install` 성공, 취약점 0건을 확인했습니다. 원격 8단계 `17f1f88` 기준이며 로컬 9단계의 새 clone 검증은 아닙니다.
- 설정 단계는 9입니다. 운영 주소의 `/aleph.json`에서 HTTP 200, 단계 8, 커밋 `17f1f88516fdc0eb9a45f79aafa17184781a05f7`을 확인했습니다. 9단계 배포는 미확인입니다. 로그인 issuer·audience·JWKS 검증 연결, 허용 경로 `GET /api/notes/:id`·`GET /api/notices`, 같은 프로젝트의 원본 `learning_notes` API를 구현과 대조했습니다. 서버 환경변수 값은 조회하지 않았고 `judgeIssuer`는 유지했습니다.
- 판정기의 RULE_IDS 다섯 개는 기존 구현 규칙만 유지합니다. `burst_read`는 탐지 사유이며 판정기 RULE_IDS에 추가하지 않습니다. 기존 로그인·본인 CRUD·기기·추가 확인·자료 구역·강사 권한 규칙과 가상 메모를 보존합니다.
- 재실행: `npm run detect:test`. 프로젝트 터미널에서 실행하며 클릭은 없습니다. 정상 30건·120건·느린 조회·서로 다른 사용자 사건은 observe, 121건·200건 폭주는 propose_revocation이어야 합니다. 실제 차단은 별도 검증 대상입니다.
- 커밋 후 `npm run bundle`로 `artifacts/submission.json`을 생성합니다. 화면에서 해당 JSON을 열어 step·commit·attackAttempts를 확인합니다. HTTP 자기 점검은 기존 7건을 전송하고 계정·DB·기기·판정기·사건 전달·회수 검증은 미실행으로 표시합니다. 정상 생성과 점검 통과는 별개이며 비로그인 API 401·공지 쓰기 405가 기대 결과입니다. 비밀값·실명·메모 본문은 넣지 않고 `bundle-notes.json`과 제출 JSON은 커밋하지 않습니다.
- 아래 8단계 및 이전 설명은 당시 기록입니다.


## 8단계 구현 기록

### 8단계 저장점

- 설정 단계 8, 허용 경로 `GET /api/notes/:id`·`GET /api/notices`, 기존 로그인 발급자·대상·JWKS와 원본 `learning_notes` API 주소를 구현과 대조했습니다. `judgeIssuer`는 유지합니다. 실제 서버 환경변수 값은 조회하지 않았습니다. RULE_IDS의 다섯 규칙은 모두 구현되어 있습니다.
- 자기 점검을 8단계로 확장했습니다. `npm.cmd run bundle`은 비로그인 메모·정적 파일·원본 API GET 3건과 공지 GET·공지 POST·관리 공지 PUT·강사 자료 GET 4건을 전송합니다. 인증정보·요청 본문을 전송하지 않으며 응답은 상태·고정 사유 코드 일치 여부만 기록합니다. 계정별 CRUD·강사 권한·실제 DB·기기·재로그인·판정기 검증은 미실행으로 구분합니다. 심판 판정이 아닙니다.
- 재실행: 커밋 후 깨끗한 작업 트리에서 `npm.cmd run bundle`. 정상은 `artifacts/submission.json` 생성, 거부 기대 결과는 비로그인 자료 API 401 및 일반 공지 쓰기 405입니다. 화면에서는 생성 JSON을 열어 attackAttempts를 확인합니다. 생성 성공 자체가 모든 점검 통과를 뜻하지 않습니다. 제출 JSON과 `bundle-notes.json`은 커밋하지 않습니다.

- 구현 커밋 `3f984ce`의 확인 결과: GitHub main 반영과 Vercel 운영 Ready를 확인했습니다. 운영 `/aleph.json`은 단계 8과 `3f984cef22f165e9c435a22395b3e765078949f1`을 반환했습니다. 이 확인 기록을 추가하는 문서 커밋의 배포 결과와는 구분합니다.
- 원격 저장소를 별도 폴더에 새로 clone한 뒤 Node 24.21.0 / npm 11.19.0에서 `npm install`이 종료 코드 0으로 끝났습니다. 패키지 10개 설치, 검사 대상 11개, 보고된 취약점 0건이며 설치 후 추적 파일 변경은 없습니다.
- 관련 모의 테스트 26개와 `npm.cmd run decider:test` 가상 검사 4개를 다시 실행해 통과했습니다. 추가로 서비스·경로·메서드·기기·쿼리·재확인 상태를 조합한 가상 요청 1,296개에서 계약 밖 속성 접근이 없고 응답 다섯 항목과 requestId가 유지되며 모든 ruleIds가 RULE_IDS에 포함되는지 확인했습니다. 모든 가능한 입력이나 운영 심판 요청 전체를 검증했다는 의미는 아닙니다.
- 실제 비로그인 HTTP 확인: 메모·공지 조회, 공지 관리 PUT, 강사 자료 GET은 401, 일반 공지 POST는 405였습니다. 실제 로그인 계정 간 타인 자료 거부와 본인·강사 성공 요청은 아직 실측하지 않았습니다. 해당 동작의 통과 결과는 모의 검사입니다.
- 메모와 공지는 서버가 `notes`, `notices` 자원 ID로 지정합니다. 기존 메모·주소·화면 메뉴를 보존합니다. 판정기는 서비스·경로·경로 모양을 함께 검사하며 단일 메모 GET과 공지 목록 GET만 허용합니다. 메모 목록·쓰기, 공지 쓰기, 강사 자료, 알 수 없는 경로, 쿼리 요청과 export 기능 경로는 거부합니다. 기기 등록·입력 검사·복합 사건 추가 확인은 유지합니다. 구현 규칙은 `starter.deny`, `device_registered`, `connection_input`, `step_up_required`, `resource_zones`입니다.
- 설정 단계는 8이며 `allowedRoutes`는 `GET /api/notes/:id`, `GET /api/notices` 두 개입니다. 기존 메모 API CRUD와 소유자 검사는 유지하지만 판정기 경유 허용 범위는 더 좁습니다. 서버 전용 강사 경로는 판정기 허용 목록에 넣지 않습니다. 로그인 issuer·audience·JWKS와 `judgeIssuer`, 원본 `learning_notes` API 주소는 유지합니다.
- `supabase/step8_resource_permissions.sql`은 기존 메모를 변경하지 않고 `vault_instructors`, `learning_notices`, `instructor_materials`를 추가합니다. 사용자가 SQL 실행 성공과 강사 등록 완료를 보고했습니다. 에이전트가 실제 DB 상태를 조회한 결과는 아닙니다. 강사 권한은 DB 관리자만 등록하며 앱 서버는 권한표를 읽기만 합니다.
- API는 검증된 Supabase 사용자 ID와 매 요청 조회한 `vault_instructors.active`를 대조합니다. 활성 강사는 `PUT /api/admin/notices/:id`로 공지 제목·내용만 수정하고 `GET /api/instructor/materials/:id`로 강사 자료를 읽습니다. 클라이언트 role은 무시하며, 권한 없음은 403, 권한표 조회 실패는 503입니다. 일반 `GET /api/notices`는 로그인 후 published=true인 공지만 반환합니다. 미공개 공지와 강사 자료는 별도 테이블로 분리합니다.
- 거부 로그에는 고정 자원 이름·사유 코드만 남기고, `X-Denial-Reason` 헤더로도 표시합니다. 타인 메모와 없는 메모는 동일한 404입니다. 기존 메모 소유자·자료 구역 검사를 유지하며 사용자 ID·토큰·본문은 로그에 넣지 않습니다.
- 재실행: `node --test test/instructor-api.test.mjs test/notes-crud.test.mjs test/resources.test.mjs test/decider-zones.test.mjs test/decider-input.test.mjs test/decider-compound.test.mjs test/auth.test.mjs`. 로컬 모의 테스트 26개 통과. 정상 본인 CRUD·활성 강사 조회/수정은 허용, 타인 메모·위조 강사 역할·회수된 권한은 거부되어야 합니다. 터미널 검사에는 화면 클릭이 없습니다. 배포 후 Vercel → Deployments → 해당 배포 → Visit, 개발자 도구 → Network → Headers에서 응답을 확인합니다.
- 운영 주소는 `https://choi-bujang-secret-vault-okfv.vercel.app/`입니다. 이 기록 커밋의 배포 결과는 커밋 시점에 미확인입니다. 실제 강사 성공·일반 사용자 거부·DB 권한·심판 검증은 로컬 모의 테스트와 구분하며 아직 미실행입니다. 아래 7단계 및 이전 기록은 당시 상태입니다.

## 7단계 저장점 (2026-10-18)

- 상황실의 7단계 재심에서 「방어에 성공했습니다」, 100/100점, 조건 7개·완결성 가점 3개 모두 통과를 확인했습니다. 판정 대상은 `d26d9129a040653186c473b26709e67838b7a879`이며 해당 커밋의 운영 배포에서 단계 7과 커밋 일치를 확인한 뒤 제출했습니다. 이 기록을 추가하는 저장점 커밋 자체를 재심한 결과는 아닙니다. 화면 확인: 방어전 상황실 → 7단계 창 → 합격 결과. 로컬 가상 검사, 공식 심판 결과, 실제 자료 차단 실측은 각각 구분합니다.
- 서버 로그인·본인 메모 CRUD와 등록 기기 규칙을 보존했습니다. 입력 검사에서 가상 `judge_fixture`와 미확인 `none`을 구분하며, 누락·불명확한 출처를 정상값으로 채우지 않습니다. 클라이언트 헤더는 신뢰 신호로 변환하지 않습니다.
- 등록 기기의 자료실 GET에서 가상 신호의 새벽 0~5시, `unusual` 네트워크, 최근 60초 이내 `risk_signal` 20건 이상이 모두 겹치면 `step_up`·`step_up_required`를 반환합니다. 지역은 조건에 넣지 않으며 영구 차단하지 않습니다. 개인별 평소 시각을 학습한 결과가 아닌 가상 사건 기준입니다.
- 실제 구현 규칙은 `starter.deny`, `device_registered`, `connection_input`, `step_up_required`입니다. 심판 피드백과 기존 가상 검사에 맞춰 복합 사건에서도 `stepUp.verified === true`이고 `authAgeSeconds`가 유한한 숫자 0~300초이면 허용합니다. 누락·문자열·음수·만료는 추가 확인을 유지합니다. 실제 동일 주체의 새 로그인 시각 검증과 자료 차단·해제 연결은 미실측입니다.
- 재실행: `npm.cmd run fixture:7`. 정상 사건은 `allow`, 복합 사건은 `step_up`이어야 합니다. 프로젝트 터미널에서 실행하며 화면 클릭은 없습니다. 미등록 기기는 `deny`·`device_not_registered`입니다. 입력·복합 사건 테스트 7개와 `npm.cmd run decider:test`의 정상·미등록·복합·재확인 가상 검사 4개를 실행해 통과했습니다. 실제 엔진·심판 판정이 아닙니다.
- 설정 단계는 7입니다. CRUD 허용 경로 5개와 서버의 `learning_notes` 사용, 로그인 issuer·audience·JWKS 검증 도우미 연결, 같은 프로젝트의 원본 `/rest/v1/learning_notes` 주소를 대조했습니다. 원격 서버 환경변수 값의 일치는 미확인입니다. `judgeIssuer`는 변경하지 않았습니다.
- 설정 운영 주소의 `/`와 `/aleph.json`에서 HTTP 200을 확인했습니다. 최초 `76ab0dc`의 43/100점·`S07_SAME_VERDICT` 이후 규칙 이름과 5분 이내 재확인 허용을 수정한 `d26d912`를 배포·재제출해 100/100점을 받았습니다. 실제 동일 주체의 재로그인 전 자료 차단·새 요청 허용 실측은 여전히 미실행입니다.
- 커밋 후 `npm.cmd run bundle`로 제출 JSON을 생성합니다. HTTP 자기 점검은 비로그인 목록·정적 메모 파일·자격증명 없는 원본 GET 3건이며, 기기·계정 CRUD·DB·재로그인 검증은 미실행으로 기록합니다. 공개 가상 메모는 보존하되 메모 본문·인증정보는 묶음에 넣지 않습니다. `bundle-notes.json`과 `artifacts/submission.json`은 커밋하지 않습니다.
- 아래 6단계 및 이전 설명은 당시 기록이며 현재 상태는 이 절을 우선합니다.

## 6단계 저장점 (2026-10-18)

- 기존 서버 로그인·본인 메모 CRUD를 보존하고 등록 기기의 자료실 GET만 허용하는 판정기 규칙을 추가했습니다. 미등록·누락은 `deny`·`device_not_registered`, 나머지는 기존 기본 거부입니다. 구현된 `RULE_IDS`는 `starter.deny`, `device_registered`입니다.
- 설정 단계는 6입니다. 기존 CRUD 허용 경로 5개를 서버 구현과 대조했고, 원본 API는 로그인 issuer와 같은 프로젝트의 `/rest/v1/learning_notes`입니다. audience·JWKS 설정과 기존 검증 도우미 연결은 유지하며, 원격 서버 환경변수 값의 일치는 확인하지 않았습니다. `judgeIssuer`는 변경하지 않았습니다.
- 설정의 운영 주소에서 `/`와 `/aleph.json` HTTP 200을 확인했습니다. 배포 식별 정보는 아직 5단계·`94f787995339e9049d4e4b19d4f3196bd9e21aa7`입니다. 이번 6단계 커밋의 배포·실제 등록 기기 접속·심판 결과는 미확인입니다.
- 재실행: `npm.cmd run decider:test`. 정상은 등록 기기 읽기 허용, 거부는 미등록 `device_not_registered`입니다. 터미널 확인이므로 화면 클릭·접속 프로그램 설치는 없습니다. 미등록 기기 공격은 심판 담당입니다.
- 커밋 후 `npm.cmd run bundle`로 `artifacts/submission.json`을 생성합니다. 자기 점검은 비로그인 서버 목록·정적 메모 파일·자격증명 없는 원본 API GET 3건만 전송합니다. 실제 기기 접속·계정 CRUD·DB 검증은 미실행으로 기록하며 심판 판정으로 간주하지 않습니다. `bundle-notes.json`과 제출 JSON은 커밋하지 않습니다.
- 아래 5단계 및 이전 설명은 당시 기록입니다. 현재 상태는 이 절과 6단계 확인 순서를 우선합니다.

## 6단계 판정기 가상 요청 확인 (2026-10-18)

5단계 저장점 이후 등록 기기 읽기 규칙을 추가했습니다. 아래는 로컬 가상 요청 확인이며 실제 배포·접속·심판 판정 결과가 아닙니다.

1. 프로젝트 폴더의 터미널에서 `npm.cmd run decider:test`를 실행합니다. 별도 접속 프로그램 설치나 화면 버튼 클릭은 필요하지 않습니다.
2. `통과 · 등록 기기의 정상 요청`을 확인합니다. 등록 여부가 정확히 `true`인 자료실 GET 요청은 `allow`·`approved`를 반환해야 합니다.
3. `통과 · 미등록 기기의 가상 요청`을 확인합니다. 이 통과는 접근 허용이 아니라, `deny`·`device_not_registered` 거부가 기대와 일치했다는 뜻입니다. 등록 여부가 없을 때도 같은 이유로 거부합니다.
4. 2026-10-18 실행에서 위 두 항목 통과를 확인했고, 같은 가상 요청의 판정 응답도 직접 확인했습니다: 등록 `allow`·`approved`, 미등록 `deny`·`device_not_registered`.

미등록 기기 공격은 심판이 담당합니다. 실제 릴레이는 미등록 기기를 판정기 전에 차단하며, 이 로컬 연습은 공격 실행이나 심판 통과 증거가 아닙니다. 아래 5단계 저장점과 기존 단계 기록은 보존합니다.

## 5단계 저장점 (2026-10-12)

- 직전 5단계 저장점은 `4acb9a7`, 공개 키 제거·서버 Auth 이전 커밋은 `520e1b9`입니다. 아래 1~4단계 설명과 검증 결과는 당시 기록으로 보존합니다. 아래의 “이번 저장점” 표현도 4단계 당시를 뜻하며, 현재 상태는 이 절을 우선합니다.
- 브라우저 메모 읽기·추가·수정·삭제는 서버 `/api/notes`와 `/api/notes/:id`를 호출합니다. 브라우저 공개 키와 Supabase SDK를 제거했으며, 로그인·세션 갱신·로그아웃도 `/api/auth` 서버 함수로 처리합니다. 서버의 로그인 검증·소유자 조건·서버 전용 환경변수는 유지했습니다.
- `supabase/step5_notes_server_only.sql`은 `public.learning_notes`의 PUBLIC·anon·authenticated 권한만 회수합니다. 전후 테이블·컬럼·상속 권한을 확인하며, 직접 권한이 남거나 service_role CRUD 권한이 없으면 취소합니다. 데이터와 RLS 정책은 유지합니다. 실제 실행은 하지 않았습니다.
- 검토 후 Supabase → SQL Editor → New query → SQL 전체 붙여 넣기 → Run. 적용 후 anon/authenticated 권한은 false, service_role CRUD는 true여야 합니다. 4단계 RLS SQL 재실행은 authenticated 권한을 다시 부여합니다.
- 정상 기대 결과: A 로그인 후 본인 CRUD 성공. 거부 기대 결과: 원본 API의 anon/authenticated 직접 읽기·쓰기 거부, 서버 무인증 401, 타인 메모 접근 404. 실제 A/B·DB 검증은 미실행입니다.
- 재실행: `node --test test/auth.test.mjs test/notes-crud.test.mjs` (모의 테스트 8개 통과), `npm.cmd run build -- --local` (로컬 빌드), 커밋 후 `npm.cmd run bundle` (제출 JSON 생성). 화면 검증은 Vercel Deployments → 해당 배포 → Visit → 자료실 로그인에서 진행합니다.
- 설정 단계는 5, 허용 경로는 기존 CRUD 5개입니다. originalApiUrl은 로그인 발급자와 같은 Supabase 프로젝트의 쿼리 없는 `/rest/v1/learning_notes` HTTPS 주소입니다. 실제 서버 환경변수 값과의 일치는 원격에서 확인하지 않았습니다.
- publicAppUrl은 확인된 운영 별칭 `https://choi-bujang-secret-vault-okfv.vercel.app/`으로 갱신했습니다. 이 주소는 후속 운영 배포를 가리킵니다. 2026-10-12 검증 당시 `/aleph.json`의 커밋은 `520e1b9e14a0bf4b34e17707d5ce7e96fb1a0357`, 개별 배포 주소는 `https://choi-bujang-secret-vault-okfv-e7kcp884n-jkimsvsd-code.vercel.app`이었고 Vercel Production Ready를 확인했습니다. 이번 문서·설정 커밋 자체의 배포 결과와 구분합니다. 로그인 issuer/audience/jwksUrl은 기존 Auth 설정과 대조했고 judgeIssuer는 유지했습니다. RULE_IDS는 구현된 기본 거부 `starter.deny`만 유지합니다.
- 실제 운영 확인: 첫 화면 HTTP 200 및 `X-Content-Type-Options: nosniff`, 화면·인증 스크립트의 공개 키 미검출을 확인했습니다. 사용자가 화면에 직접 로그인한 뒤 `로그인됨`·로그아웃 버튼·메모 입력 화면 표시 및 새로고침 후 세션 유지를 확인했습니다. 가상 잘못된 계정의 로그인 실패 안내도 확인했습니다. 정상 로그인 성공을 실제 메모 CRUD·DB 권한 회수 검증으로 간주하지 않습니다. 실제 로그아웃·토큰 갱신은 별도 검증하지 않았습니다.
- 5단계 자기 점검은 비로그인 서버 목록, 정적 메모 파일, 자격증명 없는 원본 API의 GET 총 3건만 전송합니다. 리디렉션·통신 실패는 확인 불가로, 계정 CRUD·타인 접근·원본 DB 권한 검증은 미실행으로 기록합니다. 원본의 무자격증명 거부만으로 DB 권한 회수 성공을 판단하지 않습니다. 실제 결과는 생성된 제출 JSON에 기록하며 심판 판정이 아닙니다.
- bundle-notes.json과 artifacts/submission.json은 커밋에서 제외합니다. 제출 JSON에 메모 본문·인증정보를 포함하지 않습니다.

기록 기준: 2026-10-12. 4단계 저장점 준비 직전 `preview` HEAD는 `b0c4f81`입니다. CRUD 화면과 공통 API는 `d684150`, 개별 메모 경로·DB 변경 SQL·테스트는 `2f4bea8`, API 소유자 검사와 학습 메모 소유자 SQL은 `916bf13`, RLS SQL은 `b0c4f81`에 반영되었습니다. `preview`의 `916bf13`까지 원격 push를 확인했으며, 이후 커밋의 push나 실제 배포 성공은 확인하지 않았습니다. 이번 저장점은 단계 설정·README·자기 점검을 현재 구현에 맞춥니다. 구현, 사용자 확인, 로컬 모의 검증, 실제 배포 및 심판 판정을 구분합니다.

## 1. 1~4단계 진행 기록

| 단계 | 구현 및 변경 | 확인 상태 |
|---|---|---|
| 1단계: 공개 자료 노출 확인 | 로그인 없이 공개 가상 메모를 확인하는 자료실 구성 | 이후 단계에서도 가상 자료를 보존하며 접근 방식 변경 |
| 2단계: 서버 API로 자료 조회 | 화면이 `/api/notes`를 호출하고 서버가 Supabase `learning_notes` 조회. `public/data.json` 제거 및 빌드의 정적 메모 복사 제거 | 기존 README에 2단계 완료 기록이 있음. 아래 역사 기록 참고 |
| 3단계: 진짜 로그인 | Supabase Auth 이메일·비밀번호 로그인/로그아웃, 기존 검증 도우미로 API 토큰 검사, 세션 토큰을 포함한 자료 요청, 메모 추가·수정·삭제 | 로컬 CRUD·모의 화면 검증 통과. 실제 DB 변경 SQL 적용과 A 계정 배포 CRUD 검증은 미실행. 이전 Preview 환경변수 오류 해결 결과도 미확인 |
| 4단계: 본인 자료만 접근 | 개별 GET·PUT·DELETE 소유자 조건, 수정 후 소유자 고정, A·B 격리 테스트, 학습 데이터·RLS SQL 작성 | 모의 테스트 4개 통과. SQL 적용·실제 A/B 접근·DB 권한 검증은 사용자가 진행 예정 |

### 기존 2단계 완료 기록

이전 README에는 Vercel 배포, 메모 4건과 `/data.json`, `/aleph.json`과 보안 헤더, 현재 파일·저장소의 가상 메모 검색, 심판 결과, 저장점 커밋·제출 묶음 검증이 모두 완료로 표시되어 있었습니다. 이를 당시의 기록으로 보존합니다. 이번 문서 갱신에서는 해당 결과를 재실행하거나 원본 판정 자료와 대조하지 않았으며, 이 기록을 3단계 통과 근거로 사용하지 않습니다.

### 3단계 구현 내용

- 공식 Supabase JavaScript SDK의 `signInWithPassword`, `signOut`, `onAuthStateChange`로 로그인·로그아웃·세션 복원 처리.
- 로그인 성공 시 `로그인됨`과 로그아웃 버튼 표시. 실패 시 화면에 이유 표시. 회원가입 화면은 없음.
- 브라우저가 SDK 세션의 access token을 `Authorization: Bearer …` 헤더로 자료 API에 전달.
- `/api/notes`가 기존 `src/verify-login.mjs`의 `createLoginVerifier`를 호출. 도우미는 수정하지 않음.
- 토큰이 없으면 401, 검증 실패 시 401로 자료 없이 거부. 브라우저가 보낸 `userId`·`role`로 권한을 판단하지 않음.
- 서버 환경변수가 누락되면 토큰 검증 전 500으로 중단하며 자료는 반환하지 않음.
- 검증을 통과한 요청만 DB에 접근. 추가 시 서버가 검증한 `identity.userId`를 `owner_id`로 저장하며 입력의 `owner_id`·`userId`·`role`은 신뢰하지 않음.
- 3단계 당시 목록 GET은 본인 메모만 반환했고, 한 건 GET·PUT·DELETE는 인증만 검사했습니다. 현재는 아래 4단계 소유자 검사도 적용되어 있습니다.
- 로그인 후 가상 메모 추가, 수정·수정 취소, 삭제 확인 화면 제공. 실패 시 상태에 맞는 안내 표시.
- **3단계의 역사적 허점:** B가 A의 메모 UUID를 알면 한 건 조회·수정·삭제가 가능한 구조였습니다. 4단계에서 API 소유자 조건을 추가했으며 실제 배포에서의 차단 결과는 아직 확인하지 않았습니다.
- 로그아웃 시 화면 자료 제거, 진행 중 요청 취소, 이전 세션의 늦은 응답 표시 방지.

### 4단계 구현 내용

- 목록과 개별 조회·수정·삭제는 검증된 `identity.userId`와 DB `owner_id`가 같은 행만 대상으로 합니다. 개별 작업은 UUID·소유자·가상 메모 표시 조건을 같은 DB 쿼리에 적용합니다.
- 추가는 서버가 확인한 ID를 소유자로 저장합니다. 수정은 기존 행의 소유자를 조건으로 검사하고 새 행의 소유자도 같은 ID로 고정합니다. URL·본문의 `owner_id`로 소유자를 지정하거나 이전할 수 없습니다.
- 한 건 응답 `{id,title,body}`, 수정 본문 `{title,body}`, 실제 메서드·경로 5개를 유지합니다. 타인 메모의 개별 GET·PUT·DELETE는 없는 메모와 동일한 404를 반환합니다.
- A·B 양방향 타인 접근 거부, 거부 후 원본 보존, 본인 CRUD, 소유자 위조 무시를 모의 테스트로 확인했습니다.
- 학습 데이터 SQL과 RLS·최소 권한 SQL은 별도 파일로 준비했습니다. SQL 실행 및 DB 검증은 사용자가 진행하며, 실행 완료나 심판 통과로 기록하지 않습니다.

## 2. 현재 동작 구조

1. 브라우저가 `public/index.html`을 열고 Supabase Auth 세션을 확인합니다.
2. 로그인 전에는 자료 요청 없이 로그인 안내를 표시합니다.
3. 사용자가 프로젝트에 등록된 테스트 계정으로 로그인합니다. 비밀번호와 JWT 생성·검증 흐름은 공식 SDK와 기존 서버 도우미가 처리합니다.
4. 브라우저가 세션 토큰을 포함해 `/api/notes`를 요청합니다.
5. 서버가 요청 토큰을 검증한 뒤 서버 환경변수로 Supabase에 연결합니다.
6. 목록은 `learning_notes`에서 가상 메모 표시와 검증된 사용자 `owner_id`가 일치하는 행을 조회합니다. 추가·수정·삭제도 같은 서버 API를 사용합니다.
7. 화면은 반환 자료를 텍스트로 표시하며, 로그아웃하면 지웁니다.

서버용 키는 브라우저 코드·응답·로그에 포함하지 않습니다. 브라우저의 Project URL과 publishable key는 공개 연결 설정이며 사용자 계정을 대신하지 않습니다.

## 3. 폴더와 주요 파일

| 경로 | 역할 |
|---|---|
| `public/index.html` | 로그인·로그아웃, 본인 목록, 메모 추가·수정·삭제 화면 |
| `api/notes.js` | 공통 인증과 CRUD 처리, 목록 GET·POST 진입점 |
| `api/notes/[id].js` | 한 건 GET·PUT·DELETE 동적 경로 진입점 |
| `src/verify-login.mjs` | 제공된 로그인 검증 도우미 |
| `src/attack-check.mjs` | 1·2·4단계 자기 점검. 4단계는 비로그인 목록·정적 파일 GET 결과와 미실행 항목 기록 |
| `src/decider.mjs`, `src/detect.mjs` | 이후 단계의 정책·탐지 실습 틀 |
| `aleph.config.json` | 단계, 배포 주소, 로그인 발급자, 심판 설정 |
| `scripts/build-public.mjs`, `scripts/deployment-identity.mjs` | 배포 식별 정보 생성·검증 |
| `scripts/bundle.mjs` | 커밋·설정·자가 점검을 검사하고 제출 JSON 생성 |
| `supabase/step2_learning_notes.sql` | 2단계 학습 DB 관련 SQL |
| `supabase/step3_notes_crud.sql` | 기존 자료를 보존하는 API용 UUID 컬럼·인덱스·권한 추가 |
| `supabase/step4_sample_owners.sql` | 이메일로 A/B ID 조회, 기존 가상 메모 네 건을 A에게 연결하고 B 시험 메모 추가 |
| `supabase/step4_notes_rls.sql` | 메모 테이블 권한 회수·최소 CRUD 권한·소유자 RLS·전후 권한 조회. `b0c4f81`에 커밋 |
| `test/notes-crud.test.mjs` | 메모 API 계약·인증 거부·A/B 소유자 격리 모의 회귀 테스트 |
| `docs/`, `test/`, `package/`, `xdr/` | 계약 문서, 테스트, 실습 자료 |
| `vercel.json` | 빌드 명령, 공개 폴더, `nosniff` 헤더 설정 |

공개 출력 폴더는 `public/`입니다. 루트의 기존 `data.json`은 보존되지만 빌드가 이를 `public/`에 복사하지 않습니다. 과거 Git 커밋·배포의 공개 자료까지 삭제되었다는 의미는 아닙니다.

## 4. 설정과 아직 맞춰야 할 항목

### 서버 환경변수

| 이름 | 값의 출처 | 사용 위치 |
|---|---|---|
| `SUPABASE_URL` | 같은 Supabase 프로젝트의 Connect → Project URL | Vercel 서버 함수 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API Keys의 서버용 service_role 키 | Vercel 서버 함수 전용 |

Vercel 프로젝트의 Settings → Environment Variables에서 **각 변수의 적용 환경**을 확인합니다. 같은 프로젝트라도 Production과 Preview 적용 범위는 구분됩니다. 기존 변수에 Preview가 포함되어 있다면 중복 생성할 필요가 없습니다. 특정 브랜치 제한·덮어쓰기와 정확한 변수 이름도 확인합니다.

환경변수 변경은 기존 배포에 소급 적용되지 않습니다. 변경 후 해당 환경으로 재배포하고 **새 배포의 Visit**에서 확인합니다. 값은 공식 비밀 입력란에 직접 입력하며 README, 코드, 채팅, Git, 제출 묶음에 복사하지 않습니다.

### 로그인 발급자와 단계 설정

`aleph.config.json`의 `identityProvider`에는 다음 공개 정보가 기록되어 있습니다.

- `issuer`: 화면에서 사용하는 Supabase 프로젝트 URL의 `/auth/v1`
- `audience`: `authenticated`
- `jwksUrl`: issuer 뒤에 `/.well-known/jwks.json`을 붙인 공개키 주소

현재 구현과 설정 사이에는 다음 미완료 항목이 있습니다.

- `step`은 이번 저장점에서 **4**로 맞췄습니다. 이는 구현 단계이며 DB 검증·심판 통과를 의미하지 않습니다.
- `allowedRoutes`에는 아래 CRUD 경로 5개를 기록했습니다. 이 배열 자체가 인증·권한 검사를 실행하는 것은 아닙니다.
- `publicAppUrl`은 기존 개별 배포 주소를 유지합니다. 저장점 준비 중 `/`와 `/aleph.json`에 실제 요청을 보내 HTTP 302를 확인했습니다. 배포 커밋과 현재 구현의 정합성은 확인하지 못했습니다.
- `src/attack-check.mjs`는 4단계에서 비로그인 목록 401과 정적 메모 비노출을 기대합니다. 리디렉션·통신 실패는 확인 불가, 계정이 필요한 CRUD·타인 접근·소유자 위조 및 DB RLS는 미실행으로 기록합니다. 토큰·메모 본문은 기록하지 않습니다.
- `originalApiUrl`은 null이며, 원본 API 주소 설정은 5단계부터의 항목입니다.
- `judgeIssuer`는 운영 측이 정한 값입니다. 학생 로그인 발급자와 구분하며 임의로 변경하지 않습니다.

이번 저장점에서는 단계와 자기 점검을 갱신합니다. `judgeIssuer`는 유지하며 `RULE_IDS`는 실제 기본 거부 동작을 구현한 `starter.deny`만 유지합니다. 4단계 API 검사에 대응하는 가상의 판정기 규칙을 추가하지 않습니다.

### 메모 API 계약

모든 경로에 유효한 로그인 토큰이 필요합니다. 목록은 객체로 감싼 `notes` 필드가 아닌 **배열 자체**를 반환합니다.

| 메서드·경로 (`allowedRoutes`) | 입력 | 정상 응답 |
|---|---|---|
| `GET /api/notes` | 없음 | 200, 본인 메모의 `[{id,title,body}, …]`. 없으면 `[]` |
| `POST /api/notes` | `{id?,title,body}` | 201, `{id}`. UUID 생략 시 서버 생성 |
| `GET /api/notes/:id` | 경로의 UUID | 200, `{id,title,body}` |
| `PUT /api/notes/:id` | `{title,body}` | 200, 수정된 `{id,title,body}` |
| `DELETE /api/notes/:id` | 경로의 UUID | 204, 응답 본문 없음. 이후 GET은 404 |

- 제목·본문은 비어 있지 않은 문자열이며 최대 길이는 각각 200자·20,000자입니다.
- 잘못된 UUID·JSON·입력은 400, 중복 UUID 생성은 409, 없거나 타인 소유인 한 건 조회·수정·삭제는 404입니다.
- 인증 실패는 자료 없이 401, 지원하지 않는 메서드는 405입니다. 서버 설정·DB 오류는 500이며 DB의 원본 오류나 비밀값을 응답하지 않습니다.
- API의 `id`는 DB `note_id` UUID에, `body`는 기존 DB `content`에 대응합니다. 기존 숫자형 DB `id`는 유지합니다.

### DB 변경 SQL 적용 — 사용자가 실행·검증, 결과 확인 대기

1. 기존 `learning_notes`가 있는 Supabase 프로젝트에서 **SQL Editor → New query**를 엽니다.
2. `supabase/step3_notes_crud.sql` 내용을 붙여 넣고 **Run**을 누릅니다. 2단계 테이블이 먼저 준비되어 있어야 합니다.
3. `supabase/step4_sample_owners.sql`의 이메일 자리표시자는 SQL Editor에서 직접 바꾸고 실행합니다. 실제 이메일을 저장소 파일이나 대화에 넣지 않습니다.
4. `supabase/step4_notes_rls.sql`을 검토하고 실행합니다. 기존 메모 테이블 정책을 모두 교체하므로 실행 전 정책 조회 결과도 확인합니다.
5. 아래 권한 결과를 대조하고, Preview의 서버 환경변수·배포 커밋을 확인한 뒤 A/B 정상·거부 요청을 검증합니다.

SQL은 기존 행을 삭제하지 않고 `note_id` UUID 컬럼·기본값·고유 인덱스를 추가합니다. 기존 메모의 숫자 ID·제목·본문·`owner_id`는 보존합니다. `owner_id`가 없는 기존 메모를 A에게 자동 배정하지 않으므로, 그 메모는 본인 목록에 나타나지 않습니다. 최초 로그인 시 빈 목록일 수 있으며 A가 새 메모를 추가해 확인합니다.

3단계 SQL은 `anon`·`authenticated`의 DB 직접 접근을 회수합니다. 4단계 RLS SQL은 그 이후에 적용합니다. 제공된 검증 도우미는 운영 측 심판 ID도 지원하므로 `owner_id`에는 `auth.users` 외래 키를 추가하지 않습니다.

학습 데이터 SQL은 기존 가상 메모 네 건의 제목·본문·ID를 유지하면서 소유자를 A로 연결합니다. 계정 누락·중복, 같은 A/B 계정, 대상 메모 누락·중복·다른 소유자가 있으면 전체 변경을 취소합니다. B의 공개 가능한 가상 시험 메모는 재실행 시 중복 추가하지 않습니다. 공개 가능한 내용이라는 뜻이며 비로그인 공개 권한을 부여하지 않습니다.

RLS SQL은 `public.learning_notes`만 대상으로 `PUBLIC`, `anon`, `authenticated`의 테이블 권한을 회수하고 `authenticated`에 SELECT·INSERT·UPDATE·DELETE만 부여합니다. SELECT·DELETE는 기존 행 `USING`, INSERT는 새 행 `WITH CHECK`, UPDATE는 둘 모두에서 `auth.uid() = owner_id`를 요구합니다. 다른 테이블은 변경하지 않습니다.

적용 전후 `information_schema.role_table_grants`와 `has_table_privilege` 결과를 비교합니다. 후자는 역할 상속 등을 포함한 실제 테이블 권한을 확인합니다. 예상과 다르면 SQL이 오류로 전체 변경을 취소합니다.

| 역할 | SELECT·INSERT·UPDATE·DELETE | TRUNCATE·REFERENCES·TRIGGER |
|---|---|---|
| `anon` | 모두 false | 모두 false |
| `authenticated` | 모두 true, 행 접근은 RLS로 제한 | 모두 false |

권한 조회만으로 RLS 동작이 검증되는 것은 아닙니다. 사용자 인증 문맥에서 본인 CRUD 성공, 타인 행 조회 숨김·수정/삭제 대상 0건, 타인 소유 INSERT·소유자 이전 UPDATE 거부를 따로 확인합니다. SQL Editor의 관리자 실행 결과를 사용자 접근 결과로 간주하지 않습니다. 현재 API는 `service_role`로 DB에 접근하여 RLS를 우회하므로 API 소유자 검사도 유지해야 합니다.

## 5. 다시 실행하기

Node.js 22 이상과 npm이 필요합니다. PowerShell에서 프로젝트 폴더로 이동한 뒤 최초 의존성 설치를 실행합니다.

```powershell
npm.cmd ci
```

로컬 빌드 확인:

```powershell
npm.cmd run build -- --local
```

일반 `npm run build`는 Vercel 시스템 환경변수로 배포 식별 정보를 생성하므로 로컬에서 해당 정보가 없으면 오류가 납니다. 로컬용 위 명령은 실행·정상 종료를 확인했으며 배포 식별 정보 생성은 건너뜁니다.

CRUD 회귀 테스트:

```powershell
node --test test/notes-crud.test.mjs
```

이 테스트는 메모리 DB와 모의 인증 결과를 사용하는 API 통합 검사입니다. 실제 Supabase·A 계정·심판을 호출하지 않습니다.

서버 파일 문법 확인:

```powershell
node --check api/notes.js
```

로그인 화면만 로컬에서 열려면 Python이 설치된 환경에서 다음 명령을 실행하고 `http://localhost:8000`에 접속합니다.

```powershell
python -m http.server 8000 --directory public
```

이 정적 서버는 Vercel 서버 함수 `/api/notes`를 실행하지 않습니다. 로그인부터 자료 조회까지의 통합 검증은 Preview에서 진행합니다. `--local` 빌드는 실제 배포·환경변수·심판 통과를 증명하지 않습니다.

## 6. Preview 점검 절차와 기대 결과

1. 위 DB 변경 SQL을 적용한 뒤 Preview 범위의 서버 환경변수를 확인합니다.
2. Production과 분리된 브랜치로 Preview를 배포하고 Deployments → 해당 Preview → Visit을 엽니다.
3. 같은 Supabase 프로젝트의 Authentication → Users에 준비된 A 테스트 계정으로 로그인합니다. 계정 비밀번호는 화면에 직접 입력합니다.
4. 아래 정상·거부 결과를 각각 확인하고 배포·커밋과 함께 기록합니다.

| 점검 | 기대 결과 |
|---|---|
| 자료실 비로그인 상태 | 메모 없이 로그인 안내 표시 |
| 토큰 없는 `/api/notes` 요청 | 401, 메모 없음 |
| 잘못되거나 만료된 토큰 요청 | 서버 설정이 정상일 때 401, 메모 없음 |
| `userId`·`role`만 보낸 요청 | 인증 근거로 사용하지 않고 거부 |
| 정상 A 로그인 | `로그인됨`, 목록 API 200, 본인 메모만 표시. 최초에는 빈 목록 가능 |
| A가 제목·내용 입력 후 추가 | POST 201·UUID 반환, 목록에 새 메모 표시 |
| A가 수정 → 수정 저장 | PUT 200, 수정 내용 표시 |
| A가 삭제 → 확인 | DELETE 204, 목록에서 제거, 해당 UUID GET 404 |
| 무로그인 GET·POST·PUT·DELETE | 지원 경로에서 모두 401, 자료 반환·변경 없음 |
| B가 A 메모 UUID로 개별 GET·PUT·DELETE, A가 B 메모에 같은 요청 | 모두 404, 타인 자료 반환·변경·삭제 없음 |
| URL·본문 owner_id 위조 | 소유자 지정 근거로 사용하지 않음. 본인 추가·수정 후에도 검증된 사용자 소유 유지 |
| 잘못된 비밀번호 | 로그인 실패 이유 표시 |
| 로그아웃 | 입력 폼 복귀, 표시한 메모 제거 |
| 로그아웃 뒤 이전 요청 도착 | 이전 자료가 다시 나타나지 않음 |
| `/data.json` | 404 또는 빈 메모 배열 |
| `/aleph.json` | 새 배포의 식별 정보에서 단계 4와 배포 커밋 확인. 기존 주소는 302로 확인 불가 |
| 첫 화면 응답 헤더 | `X-Content-Type-Options: nosniff` |

Preview의 Vercel 로그인 보호와 자료실의 Supabase 로그인은 별개입니다. Vercel이 `/sso-api`로 302를 반환하면 앱에 도달하지 않은 것이므로 자료 API 성공·실패로 판정하지 않습니다. Preview 접근 권한을 확보한 뒤 자료실에서는 로그아웃 상태와 로그인 상태를 나눠 확인합니다.

## 7. 지금까지 확인한 결과와 남은 문제

| 항목 | 결과·근거 |
|---|---|
| JavaScript 문법·로컬 빌드·변경 검사 | 앞선 구현 작업에서 통과 |
| 로그인·로그아웃·실패·세션 복원 | 모의 SDK 응답으로 검증 |
| API 인증 전 DB 접근 차단, 위조 필드 무시 | 로컬 모의 검증 통과 |
| 실제 도우미의 잘못된 인증 형식 거부 | 로컬 검증 통과. 도우미 파일 미수정 확인 |
| 정상 인증 결과 후 자료 표시, 로그아웃 응답 경합 | 모의 검증 통과. 실제 A 계정의 배포 통합 검증과 구분 |
| Supabase 공개 Auth 설정 | HTTP 200, 이메일 로그인 활성 확인 |
| Preview의 실제 로그인 | 사용자가 `로그인됨` 표시 확인을 보고 |
| Preview의 실제 자료 조회 | 사용자가 `Server configuration unavailable` 응답을 보고. 해결 후 성공 결과는 아직 미확인 |
| 외부에서 Preview 접근 | Vercel 로그인 보호 302를 확인. 앱 상태 직접 검증 불가 |
| CRUD 회귀 테스트 4개 | 4단계 구현 시 `node --test test/notes-crud.test.mjs` 실행, 4개 통과. 본인 CRUD, A/B 양방향 격리·소유자 위조, 무로그인/무효 인증 거부, 입력 오류·중복 UUID 검사. 실제 DB·심판 검증 아님 |
| 소유자 저장·목록 필터 | 모의 검증으로 서버 확인 ID 저장, 입력 owner_id 무시, 본인 목록 필터 확인 |
| CRUD 화면 | 모의 API로 추가·수정·삭제 버튼 및 로그아웃 상태 검증 통과 |
| CRUD 파일 문법·로컬 빌드·변경 검사 | 구현 작업에서 실행·통과 |
| DB 변경·학습 데이터·RLS SQL | 파일 작성 완료. 사용자가 DB에 적용·검증 예정, 결과 확인 대기 |
| 실제 A 계정 CRUD | Preview 배포 통합 검증 미실행 |
| B의 타인 메모 접근 | API 모의 테스트에서 거부 확인. 실제 Preview·DB 사용자 문맥 검증은 결과 대기 |
| preview 브랜치 반영 | `main`의 `916bf13`까지 fast-forward 후 원격 push 완료. 이후 RLS SQL은 `b0c4f81`에 로컬 커밋 |
| 3·4단계 심판·제출 묶음 | 완료 미확인 |

`Server configuration unavailable`은 실행 중인 API가 `SUPABASE_URL` 또는 `SUPABASE_SERVICE_ROLE_KEY`를 없거나 빈 값으로 읽었을 때 반환합니다. 어느 변수가 누락됐는지는 이 응답만으로 알 수 없습니다. 브라우저 로그인은 별도 공개 설정을 사용하므로 서버 설정 오류와 동시에 성공할 수 있습니다.

사용자는 프로젝트 환경변수가 설정되어 있다고 보고했습니다. 남은 확인은 변수의 정확한 이름, Preview·브랜치 적용 범위, 설정 변경 뒤 생성된 새 배포인지 여부입니다. 아직 원격 설정이나 재배포 성공을 직접 확인하지 않았습니다.

## 8. 제출 및 보존 원칙

- 이번 단계와 무관한 파일, 공개 가능한 가상 자료, 학습 DB를 보존합니다.
- 비밀번호·토큰·개인키·서버 전용 키·실제 개인정보·메모 본문을 제출 묶음에 넣지 않습니다.
- `bundle-notes.json`과 `artifacts/submission.json`은 Git 커밋에서 제외합니다.
- `npm.cmd run bundle`은 커밋된 설정과 깨끗한 작업 트리를 요구합니다. 커밋 후 실행하면 `artifacts/submission.json`을 생성합니다. 생성 성공은 실제 배포·DB·심판 검증 성공을 뜻하지 않습니다.
- `bundle-notes.json`에는 이번 단계 설명과 검증 미완료 사유만 기록합니다. 생성 JSON의 `attackAttempts` 중 미실행 항목은 실제 전송한 요청 수에 포함하지 않습니다. 현재 4단계 자기 점검이 전송하는 요청은 비로그인 목록과 정적 파일 GET 두 건입니다.
- `npm run bundle`의 자기 점검과 `npm run decider:test`·`npm run detect:test`의 가상 연습은 실제 심판 판정이 아닙니다.
- 실제로 확인하지 않은 배포·시험·심판 결과는 완료로 기록하지 않습니다.

참고: [Vercel 환경변수](https://vercel.com/docs/environment-variables), [Vercel 배포 환경](https://vercel.com/docs/deployments/environments), [Supabase Auth 사용자](https://supabase.com/docs/guides/auth/users).
