# 웹 주입 경보 연결

`node xdr/web-injection/respond.mjs`는 명확한 차단 후보와 알림을 저장합니다.
현재 시험 경보에는 엔진 요청과의 연결 증거가 없으므로 후보 7건, 활성 규칙 0건입니다.
`xdr/web-injection/deny-rules.json`은 전용 규칙 스냅샷이며 매 실행 교체합니다.
후보는 같은 폴더의 `block-candidates.json`, 알림은 `xdr/alerts.log`에 JSON 한 줄씩 추가합니다.
기존 ZTNA 거부·추가 확인 조건은 먼저 적용하고, 기존 허용 결과에만 외부 거부를 적용합니다.
읽기 실패·누락·만료·미일치는 기존 판정 결과를 유지합니다.

## 신뢰 연결 경계

실제 엔진 감사 기록을 확인할 수 있는 운영자가 경보와 엔진 요청을 직접 대조한 경우에만
별도 로컬 연결 파일을 전달합니다: `node xdr/web-injection/respond.mjs <연결파일경로>`.
이 파일과 deny-rules.json에 대한 쓰기 권한은 운영자로 제한해야 합니다.
경보·브라우저 입력·IP 일치·가상 계정 이름·verified 플래그로 연결 자료를 만들지 않습니다.
현재 저장소에는 운영 감사 수집기나 연결 증명 검증 서비스가 없으며 자동 연결하지 않습니다.

연결 파일 형식은 `schema: aleph.xdr.trusted-bindings.v1`과 `bindings` 배열입니다.
각 항목은 `evidenceAlertId`, `alertFingerprint`, `requestFingerprint`, `verifiedAt`, `expiresAt`을 가집니다.
두 지문은 `src/external-deny.mjs`의 함수로 **신뢰 감사 자료**에서 계산합니다.
경보 전체 JSON의 SHA-256과 엔진 요청의 식별·경로·쿼리 지문·시각·정책 버전 필드의 SHA-256입니다.
검증 시각과 만료 시각은 ISO 문자열이며 유효 기간은 최대 15분입니다. 중복·불일치·만료 연결은 후보로 남습니다.
원문 쿼리·토큰·계정·메모를 연결 파일이나 알림에 저장하지 않습니다.

규칙은 동일 requestId와 시각까지 일치하는 요청 하나만 대상으로 합니다. 같은 사용자의 이후 정상 요청,
같은 IP의 다른 사용자나 새 requestId에는 확장하지 않습니다. 사후 경보로 이미 끝난 요청을 소급 차단하지 않습니다.
따라서 실제 차단에는 요청 판정 전에 신뢰 연결과 규칙 파일이 판정 프로세스에 공급되어야 합니다.
로컬 파일 생성은 원격 배포·운영 차단이 아닙니다. `external_deny` 규칙의 운영 등록 및 파일 공급은 별도 확인 대상입니다.
응답 reasonCode는 기존 `starter_not_ready`를 재사용하며 응답 다섯 항목을 유지합니다.
알림의 `deny_rule_registered`는 파일 등록을 뜻하며 실제 차단 확인은 아니므로 `enforced: false`입니다.

## 확인

`node --test test/web-injection-response.test.mjs`와 `npm.cmd run decider:test`를 실행합니다.
정상 기대: 미연결 후보는 차단하지 않고 기존 정상 요청은 allow입니다.
거부 기대: 모의 신뢰 연결과 정확히 일치하는 요청만 만료 전에 외부 규칙에 일치합니다.
이 검사는 가상 자료 검사이며 운영 엔진·심판 통과 증거가 아닙니다. 클릭할 화면은 없습니다.
