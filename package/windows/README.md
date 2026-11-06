# Kesev Windows 설치

Windows 10 22H2 x64 및 Windows 11 x64에서 Setup.exe를 실행합니다.
설치 완료 화면에서 실행하거나 시작 메뉴에서 **Kesev**를 선택합니다.
두 로컬 서비스가 준비되면 기본 브라우저에서 http://127.0.0.1:5189/ 가 열립니다.
실행 창에서 Enter를 누르면 두 서비스가 종료됩니다. 기존 개발 서버가 5189 또는 8787을 사용 중이면 먼저 종료하세요.

- **보안 기록 → Wazuh 사건**에서 사건과 감사 이력을 확인합니다.
- Wazuh SQLite 파일은 %LOCALAPPDATA%\Kesev\Data\cloudxdr.sqlite 에 생성됩니다.
- 시작 메뉴의 **Uninstall Kesev** 또는 Windows 설정의 설치된 앱에서 제거할 수 있습니다. 제거해도 사용자 데이터는 보관됩니다.
- Wazuh Manager 연결 절차는 설치 폴더의 app\xdr\cloudxdr\README.md를 참조하세요. 이전 실습에서 실제 로그인 실패와 SW-SOC 이중 수신을 확인했습니다. 네트워크 업그레이드 후 재검증과 pfSense 실제 로그 검증은 보류 중입니다.
- Setup.exe는 코드 서명 인증서로 서명하지 않은 빌드입니다.

## 재빌드

Windows 빌드 PC에서 Git과 Inno Setup 6.7.4가 필요합니다.
이 폴더를 포함한 version/user-v1 체크아웃의 루트에서 실행합니다.

    powershell -ExecutionPolicy Bypass -File .\package\windows\build.ps1 -Compiler 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' -OutputDirectory .\dist

빌드 스크립트는 공식 Node.js 24.22.1 x64 ZIP을 내려받아 체크섬을 확인합니다.
결과는 dist\Setup.exe입니다. 배포 대상 PC에는 Node.js와 Git을 따로 설치할 필요가 없습니다.

## 0.2.15 반영 범위

예제 모드 전환의 구형 Edge 호환성 수정, 보안 기록의 Wazuh 사건/승인·반려/모의 결과/감사 이력, UDP 직접 수신, Cisco IOS 및 pfSense 원문 파서와 연동 예제가 포함됩니다.
UDP는 사용자 데이터 폴더의 udp.json을 별도로 설정해야 시작됩니다. VM의 SSH 키·자동 시작 작업·방화벽 규칙과 장비 주소 설정은 설치 파일이 자동 배포하지 않습니다.
배포물에는 개발 PC의 DB, 로그, 비밀번호, 토큰, SSH 키를 넣지 않습니다. payload-manifest.json은 포함 파일의 SHA-256 목록입니다.
이번 빌드는 소스와 패키지 내용 확인 대상이며 새 VM 설치 및 실제 장비 연동 시험은 사용자 요청에 따라 보류합니다.
