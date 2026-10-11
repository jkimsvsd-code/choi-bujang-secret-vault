# Choi Bujang Secret Vault

Vercel, GitHub, Supabase로 가상 메모 자료실을 만들고 단계별로 접근 통제를 추가하는 알레프 방어전 실습 프로젝트입니다. 실제 개인정보나 민감한 자료는 사용하지 않습니다.

**현재 진행: 3단계 「진짜 로그인을 붙입니다」 — 로그인 화면과 자료 API 토큰 검증 구현, 배포 통합 검증 진행 중.**

기록 기준: 2026-10-11. 최신 구현 커밋은 `f4c628f` (`Connect materials API to verified login sessions`)입니다. 구현, 사용자 확인, 로컬 모의 검증, 실제 배포 및 심판 판정을 구분합니다.

## 1. 1~3단계 진행 기록

| 단계 | 구현 및 변경 | 확인 상태 |
|---|---|---|
| 1단계: 공개 자료 노출 확인 | 로그인 없이 공개 가상 메모를 확인하는 자료실 구성 | 이후 단계에서도 가상 자료를 보존하며 접근 방식 변경 |
| 2단계: 서버 API로 자료 조회 | 화면이 `/api/notes`를 호출하고 서버가 Supabase `learning_notes` 조회. `public/data.json` 제거 및 빌드의 정적 메모 복사 제거 | 기존 README에 2단계 완료 기록이 있음. 아래 역사 기록 참고 |
| 3단계: 진짜 로그인 | Supabase Auth 이메일·비밀번호 로그인/로그아웃, 기존 검증 도우미로 API 토큰 검사, 세션 토큰을 포함한 자료 요청 | 코드·로컬 검증 완료. 사용자 로그인 성공 보고. 로그인 후 자료 조회는 Preview 환경변수 오류로 검증 미완료 |

### 기존 2단계 완료 기록

이전 README에는 Vercel 배포, 메모 4건과 `/data.json`, `/aleph.json`과 보안 헤더, 현재 파일·저장소의 가상 메모 검색, 심판 결과, 저장점 커밋·제출 묶음 검증이 모두 완료로 표시되어 있었습니다. 이를 당시의 기록으로 보존합니다. 이번 문서 갱신에서는 해당 결과를 재실행하거나 원본 판정 자료와 대조하지 않았으며, 이 기록을 3단계 통과 근거로 사용하지 않습니다.

### 3단계 구현 내용

- 공식 Supabase JavaScript SDK의 `signInWithPassword`, `signOut`, `onAuthStateChange`로 로그인·로그아웃·세션 복원 처리.
- 로그인 성공 시 `로그인됨`과 로그아웃 버튼 표시. 실패 시 화면에 이유 표시. 회원가입 화면은 없음.
- 브라우저가 SDK 세션의 access token을 `Authorization: Bearer …` 헤더로 자료 API에 전달.
- `/api/notes`가 기존 `src/verify-login.mjs`의 `createLoginVerifier`를 호출. 도우미는 수정하지 않음.
- 토큰이 없으면 401, 검증 실패 시 401로 자료 없이 거부. 브라우저가 보낸 `userId`·`role`로 권한을 판단하지 않음.
- 서버 환경변수가 누락되면 토큰 검증 전 500으로 중단하며 자료는 반환하지 않음.
- 검증을 통과한 요청만 DB 조회. 로그인 사용자별 메모 소유권 구분은 아직 구현하지 않음.
- 로그아웃 시 화면 자료 제거, 진행 중 요청 취소, 이전 세션의 늦은 응답 표시 방지.

## 2. 현재 동작 구조

1. 브라우저가 `public/index.html`을 열고 Supabase Auth 세션을 확인합니다.
2. 로그인 전에는 자료 요청 없이 로그인 안내를 표시합니다.
3. 사용자가 프로젝트에 등록된 테스트 계정으로 로그인합니다. 비밀번호와 JWT 생성·검증 흐름은 공식 SDK와 기존 서버 도우미가 처리합니다.
4. 브라우저가 세션 토큰을 포함해 `/api/notes`를 요청합니다.
5. 서버가 요청 토큰을 검증한 뒤 서버 환경변수로 Supabase에 연결합니다.
6. `learning_notes`에서 가상 메모 표시가 일치하는 행의 제목·내용을 조회해 반환합니다.
7. 화면은 반환 자료를 텍스트로 표시하며, 로그아웃하면 지웁니다.

서버용 키는 브라우저 코드·응답·로그에 포함하지 않습니다. 브라우저의 Project URL과 publishable key는 공개 연결 설정이며 사용자 계정을 대신하지 않습니다.

## 3. 폴더와 주요 파일

| 경로 | 역할 |
|---|---|
| `public/index.html` | 로그인·로그아웃 화면, 세션 상태와 자료 표시 |
| `api/notes.js` | 요청 토큰 검증 후 Supabase 자료 조회 |
| `src/verify-login.mjs` | 제공된 로그인 검증 도우미 |
| `src/attack-check.mjs` | 제출 묶음에 넣는 실제 요청 자기 점검. 현재 1·2단계만 지원 |
| `src/decider.mjs`, `src/detect.mjs` | 이후 단계의 정책·탐지 실습 틀 |
| `aleph.config.json` | 단계, 배포 주소, 로그인 발급자, 심판 설정 |
| `scripts/build-public.mjs`, `scripts/deployment-identity.mjs` | 배포 식별 정보 생성·검증 |
| `scripts/bundle.mjs` | 커밋·설정·자가 점검을 검사하고 제출 JSON 생성 |
| `supabase/step2_learning_notes.sql` | 2단계 학습 DB 관련 SQL |
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

- `step`은 아직 **2**입니다. 3단계 완료·제출로 표시할 상태가 아닙니다.
- `allowedRoutes`는 빈 배열입니다. 3단계 제출 전 실제 허용 API 경로와 맞춰야 합니다.
- `publicAppUrl`은 이전 개별 배포 주소입니다. 최종 검증할 배포 주소와의 정합성 확인이 필요합니다.
- `src/attack-check.mjs`는 아직 2단계의 비로그인 API 200을 기대합니다. 현재 3단계 API의 비로그인 401 정책과 다르므로 3단계 자기 점검으로 사용할 수 없습니다.
- `originalApiUrl`은 null이며, 원본 API 주소 설정은 5단계부터의 항목입니다.
- `judgeIssuer`는 운영 측이 정한 값입니다. 학생 로그인 발급자와 구분하며 임의로 변경하지 않습니다.

이번 README 갱신은 위 설정이나 소스 코드를 변경하지 않습니다.

## 5. 다시 실행하기

Node.js 22 이상과 npm이 필요합니다. PowerShell에서 프로젝트 폴더로 이동한 뒤 최초 의존성 설치를 실행합니다.

```powershell
npm.cmd ci
```

로컬 빌드 확인:

```powershell
npm.cmd run build -- --local
```

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

1. Preview 범위의 서버 환경변수를 확인합니다.
2. Production과 분리된 브랜치로 Preview를 배포하고 Deployments → 해당 Preview → Visit을 엽니다.
3. 같은 Supabase 프로젝트의 Authentication → Users에 준비된 A 테스트 계정으로 로그인합니다. 계정 비밀번호는 화면에 직접 입력합니다.
4. 아래 정상·거부 결과를 각각 확인하고 배포·커밋과 함께 기록합니다.

| 점검 | 기대 결과 |
|---|---|
| 자료실 비로그인 상태 | 메모 없이 로그인 안내 표시 |
| 토큰 없는 `/api/notes` 요청 | 401, 메모 없음 |
| 잘못되거나 만료된 토큰 요청 | 서버 설정이 정상일 때 401, 메모 없음 |
| `userId`·`role`만 보낸 요청 | 인증 근거로 사용하지 않고 거부 |
| 정상 A 로그인 | `로그인됨`, API 200, 가상 메모 4건 표시 |
| 잘못된 비밀번호 | 로그인 실패 이유 표시 |
| 로그아웃 | 입력 폼 복귀, 표시한 메모 제거 |
| 로그아웃 뒤 이전 요청 도착 | 이전 자료가 다시 나타나지 않음 |
| `/data.json` | 404 또는 빈 메모 배열 |
| `/aleph.json` | 해당 배포 식별 정보 확인. 현재 설정상 단계는 2 |
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
| 3단계 심판·제출 묶음 | 완료 미확인 |

`Server configuration unavailable`은 실행 중인 API가 `SUPABASE_URL` 또는 `SUPABASE_SERVICE_ROLE_KEY`를 없거나 빈 값으로 읽었을 때 반환합니다. 어느 변수가 누락됐는지는 이 응답만으로 알 수 없습니다. 브라우저 로그인은 별도 공개 설정을 사용하므로 서버 설정 오류와 동시에 성공할 수 있습니다.

사용자는 프로젝트 환경변수가 설정되어 있다고 보고했습니다. 남은 확인은 변수의 정확한 이름, Preview·브랜치 적용 범위, 설정 변경 뒤 생성된 새 배포인지 여부입니다. 아직 원격 설정이나 재배포 성공을 직접 확인하지 않았습니다.

## 8. 제출 및 보존 원칙

- 이번 단계와 무관한 파일, 공개 가능한 가상 자료, 학습 DB를 보존합니다.
- 비밀번호·토큰·개인키·서버 전용 키·실제 개인정보·메모 본문을 제출 묶음에 넣지 않습니다.
- `bundle-notes.json`과 `artifacts/submission.json`은 Git 커밋에서 제외합니다.
- `npm.cmd run bundle`은 커밋된 설정과 깨끗한 작업 트리를 요구합니다. 현재 3단계 설정·자기 점검 정합성 작업이 남아 있습니다.
- `npm run bundle`의 자기 점검과 `npm run decider:test`·`npm run detect:test`의 가상 연습은 실제 심판 판정이 아닙니다.
- 실제로 확인하지 않은 배포·시험·심판 결과는 완료로 기록하지 않습니다.

참고: [Vercel 환경변수](https://vercel.com/docs/environment-variables), [Vercel 배포 환경](https://vercel.com/docs/deployments/environments), [Supabase Auth 사용자](https://supabase.com/docs/guides/auth/users).
