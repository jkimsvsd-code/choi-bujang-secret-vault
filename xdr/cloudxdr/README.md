# CloudXDR 1차 버전

Node.js 24 이상에서 저장소 루트에서 실행합니다.

```powershell
node xdr/cloudxdr/server.mjs
```

브라우저에서 http://127.0.0.1:8787 을 열고 **데모 경보 5건 접수**를 누릅니다.
사건 상세에서 **승인 및 모의 차단** 또는 **반려**를 선택합니다. 승인하면 모의 실행 성공과 감사 이력이 표시됩니다. 반려를 확인하려면 데모 경보를 다시 접수합니다. 이미 처리했거나 만료된 후보를 다시 처리하면 HTTP 409가 반환됩니다.

Wazuh JSON 경보 한 건을 로컬 API에 보내는 예입니다.

```powershell
$alert = @{ id = 'lab.1'; manager = @{ name = 'wazuh-lab' }; data = @{ srcip = '192.0.2.10' }; rule = @{ groups = @('authentication_failed'); description = 'sshd: Failed password' } }
Invoke-RestMethod http://127.0.0.1:8787/api/wazuh -Method Post -ContentType application/json -Body ($alert | ConvertTo-Json -Depth 5)
```

Wazuh 연동 스크립트는 POST 본문에 경보 객체 하나를 전달합니다. Wazuh Manager가 다른 호스트에 있으면 별도의 인증된 전달 경로가 필요합니다. 이 콘솔은 루프백에 바인딩하는 로컬 단일 운영자 실습용입니다.

- 최초 접수 시 사건을 만들고, 같은 IP의 경보를 최초 접수부터 5분간 묶습니다.
- 기존 판정기가 확신도 0.85 이상으로 차단 판정하거나 사건에 경보 5건이 모이면 15분 동안 유효한 후보를 만듭니다. 판정과 집계 기준은 실습용입니다.
- 동일한 `manager.name`과 `id` 조합은 한 번만 집계합니다. 원본 로그 전문은 저장하지 않습니다.
- 승인 시 모의 실행 결과만 기록합니다. 사건, 후보, 감사 기록은 실행 디렉터리의 `cloudxdr.sqlite`에 저장됩니다. `CLOUDXDR_DB`와 `CLOUDXDR_PORT`로 파일과 포트를 지정할 수 있습니다.
- 기존 체크아웃에 적용할 때는 이 `xdr/cloudxdr/` 폴더를 복사합니다. 독립 실행용 사본에는 원본 `xdr/brute-force/decide.mjs`가 포함됩니다.

## 실제 Wazuh Manager 연결

케셰브의 사건 조회, 승인·반려, 모의 대응 및 감사 이력은 로컬 테스트 경보로 검증했습니다. 실제 Manager에서 SSH 터널을 거쳐 경보가 전달되는 경로는 아직 검증하지 않았습니다.

1. Windows에서 케셰브와 XDR 수신기를 시작한 상태로, Wazuh Manager로 SSH 역방향 터널을 엽니다. 아래 `MANAGER_HOST`를 SSH로 접근 가능한 관리 주소로 바꿉니다.

   ```powershell
   ssh -N -o ExitOnForwardFailure=yes -R 127.0.0.1:18787:127.0.0.1:8787 ops@MANAGER_HOST
   ```

2. Manager에 `custom-kesev` 파일을 복사한 뒤 `sudo install -o root -g wazuh -m 750 custom-kesev /var/ossec/integrations/custom-kesev`로 설치합니다.
3. Manager의 `/var/ossec/etc/ossec.conf`를 백업한 뒤 `wazuh-integration.xml`의 내용을 기존 `<ossec_config>` 내부에 추가하고 `sudo systemctl restart wazuh-manager`로 설정을 적용합니다.
4. Manager가 감시하는 실습용 SSH 호스트에서 로그인 실패를 발생시킨 뒤 케셰브의 **보안 기록 → Wazuh 사건**에서 새로고침합니다. 동일 출발지의 경보가 5분 안에 5건 접수되면 후보가 나타납니다. 승인과 반려는 별도 사건에서 확인합니다.

터널은 Manager의 루프백에서만 수신합니다. Integrator는 경보 ID, Manager 이름, 출발지 IP와 판정 필드만 전달합니다.
