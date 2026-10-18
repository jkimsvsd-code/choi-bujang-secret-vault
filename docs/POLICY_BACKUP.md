# 10단계 정책 사본과 복원 범위 미리보기

운영 파일과 DB를 변경하지 않는 로컬 도구입니다. 복원 실행 기능은 없습니다.
사본에는 `src/decider.mjs` 전체, `aleph.config.json`의 `allowedRoutes`만,
DB 정책 정의 SQL(3 → 4 → 5 → 8단계 순서)을 보관합니다.
4단계의 직접 접근 허용은 5단계에서 회수되므로 4단계만 현재 정책으로 간주하지 않습니다.
SQL에는 마이그레이션도 포함되어 있으므로 사본을 DB에 그대로 실행하지 마세요.
실제 DB 정책을 조회한 백업이나 자료 복구용 데이터 백업은 아닙니다.
메모 본문·계정·환경변수·설정의 다른 필드는 수집하지 않습니다.

프로젝트 터미널에서 실행합니다. 화면 클릭은 없습니다.

1. `npm.cmd run policy:backup -- capture step9-baseline`
2. 출력된 SHA-256을 별도로 보관합니다. 아래 `HASH`를 그 값으로 대체합니다.
3. `npm.cmd run policy:backup -- simulate step9-baseline HASH`
4. 이후 비교만 다시 보려면 `npm.cmd run policy:backup -- preview step9-baseline HASH`

사본은 Git에서 제외된 `artifacts/policy-backups/step9-baseline/`에 생성합니다.
`snapshot.json`은 기준 사본, `snapshot.sha256`은 확인용 해시,
`trial.json`은 침공을 흉내 낸 시험 정책입니다. 기존 이름은 덮어쓰지 않습니다.
기준 정책 파일이 커밋과 다르면 capture도 중단합니다.

정상 결과: 기준 커밋·단계·검증 해시·변경 범위를 먼저 출력하고,
시험 사본에서 GET을 POST로 바꾼 허용 경로 한 줄의 차이만 표시합니다.
`-`는 검증한 기준, `+`는 시험 상태이며 복원 시 되돌릴 방향은 `+`에서 `-`입니다.
거부 결과: 사본/해시 누락, 해시 불일치, 시험 정책 항목 누락·추가 시 비정상 종료하며
복원이나 운영 파일 쓰기를 수행하지 않습니다. 누락된 사본을 자동 재생성하지 않습니다.
검증 때 해시 파일에서 값을 자동으로 읽어 신뢰하지 말고 처음 별도로 보관한 해시를 사용하세요.
해시는 변조 탐지를 위한 기준이며 서명이나 별도 저장소 백업을 대신하지 않습니다.

로컬 검사: `node --test test/policy-backup.test.mjs`.
이 검사는 가상 파일 검사이며 운영 DB·접속 회수·심판 검증이 아닙니다.
