# CloudXDR 1차 버전

## 실제 장비 syslog와 검증 보류 상태

2026-11-05 이중화 네트워크 업그레이드 작업으로 실제 장비 시험을 중단했습니다.
구현한 직접 수신 형식은 Cisco IOS의 LINK·LINEPROTO·SYS CONFIG_I 이벤트와 pfSense IPv4 TCP·UDP filterlog입니다.
Manager가 전달한 원문과 직접 받은 UDP 원문에 같은 파서를 사용해 이벤트 ID를 계산하고,
장비 IP, 상태 변경 또는 통신 양쪽 주소·포트, 수신 경로와 감사 이력을 사건에 저장합니다.

- SW-SOC의 실제 LINK-3-UPDOWN 및 SYS-5-CONFIG_I에서 UDP 직접 수신과 Wazuh 경보의 동일 이벤트 ID를 확인했습니다.
- pfSense 실제 필터 로그의 양쪽 수신·화면 검증은 완료되지 않았습니다. 시험 트래픽에 적용된 정책 tracker 1762321018의 로그 옵션이 꺼져 있었습니다. 로그 옵션을 켜려던 콘솔 명령은 셸 오류로 실패했으므로 재개 시 현재 정책부터 다시 확인해야 합니다.
- 이번에 적용한 장비 설정은 SW-SOC Vlan99 10.20.99.33/24, 두 UDP 5514 목적지 10.20.99.10 및 10.20.99.250, pfSense 필터 로그의 같은 두 원격 목적지와 송신 주소 10.20.99.1입니다. SW-SOC의 기존 로그 출발지 Vlan900 10.30.0.33을 사용합니다.
- pfSense의 내려가 있던 pflog0는 실행 중에 활성화했습니다. 재부팅 후 로깅 인터페이스 상태와 실제 정책 로그 옵션은 업그레이드 후 재확인해야 합니다.
- Wazuh 설정 백업은 /var/ossec/backup/kesev-native-20261105060922, pfSense 설정 백업은 /conf/config.xml.pre-kesev-native입니다.

네트워크 업그레이드 후에는 현재 장비 IP·VLAN·경로와 송신자 허용 목록을 먼저 대조하고, 실제 이벤트 생성 → 양쪽 UDP 수신 → Manager 경보 전달 → 보안 기록 분석·감사 이력 순서로 검증을 재개합니다.

## UDP 직접 수신 시연

수신기의 실행 디렉터리에 아래와 같은 `udp.json`을 두면 지정한 IPv4 주소에서 UDP syslog를 직접 받습니다. Windows 방화벽에도 같은 포트와 송신자 범위를 허용해야 합니다.

```json
{"host":"10.20.99.250","port":5514,"allowedPeers":["10.20.99.250","10.20.99.10"]}
```

`demo/send-dual-udp.ps1`은 통신 차단을 나타내는 시연용 JSON syslog를 Wazuh와 케셰브에 각각 UDP로 보냅니다. 실제 차단 트래픽을 발생시키는 명령이 아닙니다. 지원하는 형식은 syslog 프로그램명 `cxdr-fw`와 `kesev_kind=network`, 이벤트 ID, 출발지·목적지 IP와 포트, 프로토콜, 행위 필드입니다.

Wazuh에는 `demo/network-decoder.xml`과 `demo/network-rule.xml`을 사용자 정의 디코더·룰 경로에 설치하고, UDP syslog 수신 설정 및 `custom-kesev` Integrator의 `kesev_network` 그룹을 설정합니다. 케셰브 **보안 기록 → Wazuh 사건**에서 같은 이벤트 ID의 UDP 직접 관측과 Manager 경보를 비교할 수 있습니다. 통신 허용·차단 기록을 표시하며 로그인 실패의 차단 후보 생성 기준은 네트워크 관측에 적용하지 않습니다.

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

케셰브의 사건 조회, 승인·반려, 모의 대응 및 감사 이력은 로컬 테스트 경보로 검증했습니다. 이전 실습에서 실제 Manager의 로그인 실패 경보가 SSH 터널을 거쳐 전달되는 경로를 확인했습니다. 네트워크 업그레이드 후 다시 검증해야 합니다.

1. Windows에서 케셰브와 XDR 수신기를 시작한 상태로, Wazuh Manager로 SSH 역방향 터널을 엽니다. 아래 `MANAGER_HOST`를 SSH로 접근 가능한 관리 주소로 바꿉니다.

   ```powershell
   ssh -N -o ExitOnForwardFailure=yes -R 127.0.0.1:18787:127.0.0.1:8787 ops@MANAGER_HOST
   ```

2. Manager에 `custom-kesev` 파일을 복사한 뒤 `sudo install -o root -g wazuh -m 750 custom-kesev /var/ossec/integrations/custom-kesev`로 설치합니다.
3. Manager의 `/var/ossec/etc/ossec.conf`를 백업한 뒤 `wazuh-integration.xml`의 내용을 기존 `<ossec_config>` 내부에 추가하고 `sudo systemctl restart wazuh-manager`로 설정을 적용합니다.
4. Manager가 감시하는 실습용 SSH 호스트에서 로그인 실패를 발생시킨 뒤 케셰브의 **보안 기록 → Wazuh 사건**에서 새로고침합니다. 동일 출발지의 경보가 5분 안에 5건 접수되면 후보가 나타납니다. 승인과 반려는 별도 사건에서 확인합니다.

터널은 Manager의 루프백에서만 수신합니다. Integrator는 경보 ID, Manager 이름, 출발지 IP와 판정 필드만 전달합니다.
