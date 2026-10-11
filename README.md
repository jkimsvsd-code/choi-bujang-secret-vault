# Choi Bujang Secret Vault

알레프 방어전 실습 프로젝트입니다. Vercel, GitHub, Supabase를 이용해 가상 메모를 조회하는 웹 서비스를 구성하고, 공개 파일과 서버 API의 차이 및 자료 노출 위험을 점검합니다.

## 1. 프로젝트 개요

- **웹 화면:** HTML, CSS, JavaScript
- **배포:** Vercel
- **저장소:** GitHub
- **데이터베이스:** Supabase
- **메모 조회:** Vercel 서버 함수 `/api/notes`
- **현재 단계:** Step 2 — 서버 API를 통한 메모 조회

실제 개인정보나 민감한 자료가 아닌 실습용 가상 메모만 사용합니다.

## 2. 현재 동작 구조

1. 사용자가 배포된 웹 화면에 접속합니다.
2. 브라우저는 `/api/notes`를 요청합니다.
3. Vercel 서버 함수는 서버 환경변수 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`를 사용해 Supabase의 `learning_notes` 테이블을 조회합니다.
4. 조회 결과를 JSON으로 반환하고 화면에 메모 카드를 표시합니다.

서버 전용 키는 브라우저 코드, API 응답 및 로그에 포함하지 않습니다.

## 3. 주요 파일

| 경로 | 역할 |
|---|---|
| `public/index.html` | 메모 카드를 표시하는 웹 화면 |
| `api/notes.js` | Supabase 메모 조회 서버 함수 |
| `aleph.config.json` | 단계 및 심판 관련 설정 |
| `scripts/build-public.mjs` | 배포용 식별 정보 생성 |
| `scripts/deployment-identity.mjs` | 배포 환경 정보 검증 |
| `vercel.json` | 빌드, 출력 폴더 및 보안 헤더 설정 |
| `README.md` | 프로젝트 구성, 점검 절차 및 보안 한계 |

## 4. 정적 공개 파일과 API

현재 메모 데이터는 `public/data.json`에 복사하지 않습니다. 화면은 `/api/notes`를 통해 메모를 조회합니다.

`/data.json`은 메모가 포함되지 않은 404 응답 또는 빈 메모 상태여야 합니다. 실제 배포 응답은 별도로 확인해야 합니다.

배포 식별 정보는 빌드 과정에서 `public/aleph.json`에 생성됩니다. 이 파일은 저장소와 배포를 확인하기 위한 정보이며, 그 자체로 심판 성공을 증명하지는 않습니다.

## 5. 보안상 한계

### 공개 API 접근

현재 `/api/notes`에는 사용자 인증 및 접근 권한 검사가 없습니다. 따라서 누구나 API를 직접 호출해 반환되는 실습용 메모를 조회할 수 있습니다.

서버 전용 키를 사용한다는 사실만으로 공개 API 자체가 보호되는 것은 아닙니다. 실제 개인정보나 민감한 자료를 넣기 전에는 인증·인가 정책과 요청 제한을 추가해야 합니다.

### 서버 전용 환경변수

Vercel Production 환경에는 다음 환경변수가 필요합니다.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

두 번째 변수에는 서버에서만 사용하는 Supabase 비밀 키를 설정합니다. 이 값은 코드, GitHub 저장소, 브라우저 파일, 응답 및 로그에 노출하지 않습니다.

### 과거 노출 가능성

현재 공개 파일을 삭제하거나 최신 커밋을 수정하더라도 과거 GitHub 커밋이나 이전 배포에 메모가 남아 있을 수 있습니다.

따라서 현재 파일이 정리되었다는 사실만으로 과거 노출이 해결되었다고 판단하지 않습니다. 이전 공개 이력과 배포는 별도로 확인해야 합니다.

## 6. 검증 절차

아래 결과는 실제로 확인한 뒤 기록합니다. 확인하지 않은 항목은 성공으로 표시하지 않습니다.

### 로컬 코드 및 빌드 검증

PowerShell에서 프로젝트 폴더로 이동한 뒤 실행합니다.

```powershell
node --check .\api\notes.js
node --check .\scripts\build-public.mjs
node --check .\scripts\deployment-identity.mjs
node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf8')); console.log('vercel.json JSON OK')"
npm.cmd run build -- --local
```

`--local` 빌드는 로컬 화면과 빌드 흐름을 확인하기 위한 것입니다. 실제 Vercel 배포나 심판 접수를 증명하지 않습니다.

### 현재 파일 및 GitHub 최신 파일 검색

배포 파일과 GitHub 최신 커밋에서 실습용 메모 문장을 검색합니다. 검색할 문장은 실제 데이터에 저장된 가상 메모의 제목과 본문을 기준으로 선정합니다.

검색 결과에는 다음을 구분해 기록합니다.

- 검색 대상과 확인 시점
- 일치하는 문장이 발견되었는지
- 검색 결과가 없었다면 어떤 파일과 경로를 확인했는지
- 과거 커밋이나 이전 배포는 별도로 남아 있는지

검색 결과가 없다는 사실만으로 과거 노출이 해결되었다고 단정하지 않습니다.

### 배포 URL 점검

실제 배포가 끝난 뒤 다음 항목을 확인합니다.

| 점검 대상 | 기대 결과 |
|---|---|
| `/` | 웹 화면이 정상적으로 열림 |
| `/api/notes` | 가상 메모 4건 반환 |
| `/data.json` | 404 또는 메모 0건 |
| `/aleph.json` | 배포 식별 JSON 확인 가능 |
| 첫 화면 응답 헤더 | `X-Content-Type-Options: nosniff` 확인 |

실제 응답과 기대 결과가 다르면 차이를 기록하고 원인을 확인합니다.

### 심판 검증

심판 결과는 실제 심판 요청 및 응답을 확인한 뒤 기록합니다. 코드 검사, 로컬 빌드 또는 `aleph.json`의 존재만으로 방어 성공을 주장하지 않습니다.

## 7. 변경 및 제출 원칙

- 한 번에 하나의 작업 단위만 변경합니다.
- 기존 기능과 무관한 변경은 피합니다.
- 비밀번호, 토큰, 서버 전용 키 및 실제 개인정보를 코드·커밋·제출 묶음에 포함하지 않습니다.
- `judgeIssuer` 설정은 임의로 변경하지 않습니다.
- `bundle-notes.json`과 `artifacts/submission.json`은 Git 커밋에 포함하지 않습니다.
- 제출 묶음은 `npm run bundle` 실행 후 실제 결과를 확인합니다.

## 8. 진행 상태

- [x] 화면에서 `/api/notes`를 호출하도록 수정
- [x] 정적 `public/data.json` 제거
- [x] 빌드 스크립트에서 정적 메모 JSON 복사 제거
- [x] `step`을 2로 변경
- [x] 서버 API의 공개 접근 한계 문서화
- [x] `X-Content-Type-Options: nosniff` 설정 추가
- [x] 관련 JavaScript 문법 검사 및 `git diff --check` 통과
- [x] 실제 Vercel 배포 검증
- [x] 메모 4건 및 `/data.json` 응답 확인
- [x] `/aleph.json` 및 배포 응답 보안 헤더 확인
- [x] 가상 메모 문장의 현재 파일·저장소 검색 결과 기록
- [x] 심판 검증 결과 확인
- [x] Step 2 저장점 커밋 및 제출 묶음 검증

진행 상태는 실제 검증 결과에 따라 갱신합니다.