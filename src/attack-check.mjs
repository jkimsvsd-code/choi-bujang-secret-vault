// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 4, 5, 6, 7, 8].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  if (config.step === 2 || config.step === 4 || config.step >= 5) {
    // Record only status and counts, never response bodies or raw network errors.
    const check = async (path, attackId, expected, inspect, method = 'GET') => {
      let response;
      try {
        response = await fetch(new URL(path, app), {
          method, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000),
        });
      } catch {
        return { attackId, expected, observed: '확인 불가: 요청 실패 또는 시간 초과 (HTTP 응답 없음)' };
      }
      if (response.status >= 300 && response.status < 400) {
        let vercelLogin = false;
        try {
          const destination = new URL(response.headers.get('location'), app);
          vercelLogin = destination.origin === 'https://vercel.com'
            && destination.pathname === '/sso-api';
        } catch {
          // Never record Location values, which can contain authentication data.
        }
        await response.body?.cancel();
        return { attackId, expected,
          observed: `확인 불가: HTTP ${response.status}, ${vercelLogin
            ? 'Vercel 로그인 보호로 이동하여 앱 응답을 확인하지 못함'
            : '리디렉션 응답 (이동 대상은 요청하지 않음)'}` };
      }
      let data;
      try {
        data = await response.json();
      } catch {
        // An unreadable response is not evidence of an empty notes array.
      }
      return { attackId, expected, observed: inspect(response, data) };
    };
    const api = config.step >= 4
      ? await check('/api/notes', 'anonymous_api_note_read',
        'GET /api/notes: 비로그인 HTTP 401, 메모 반환 없음',
        (response, data) => {
          const errorOnly = data && !Array.isArray(data)
            && Object.keys(data).length === 1 && typeof data.error === 'string';
          return `${response.status === 401 && errorOnly ? '기대와 일치' : '기대와 다름'}: HTTP ${response.status}, 오류 전용 응답 ${errorOnly ? '확인' : '미확인'}`;
        })
      : await check('/api/notes', 'anonymous_api_note_read',
      'GET /api/notes: HTTP 200, 가상 메모 확인 표시와 메모 4건',
      (response, data) => {
        const count = Array.isArray(data?.notes) ? data.notes.length : null;
        const valid = response.status === 200 && data?.sampleMarker === config.sampleMarker
          && count === 4 && data.notes.every(note => note && typeof note.title === 'string'
            && typeof note.content === 'string');
        return `${valid ? '기대와 일치' : '기대와 다름'}: HTTP ${response.status}, 메모 ${count === null ? '배열 확인 불가' : count + '건'}, 확인 표시 ${data?.sampleMarker === config.sampleMarker ? '일치' : '불일치'}`;
      });
    const staticFile = await check('/data.json', 'static_note_exposure',
      'GET /data.json: HTTP 404 또는 HTTP 200의 빈 메모 배열',
      (response, data) => {
        const count = Array.isArray(data?.notes) ? data.notes.length : null;
        const valid = (response.status === 404 && (count === null || count === 0))
          || (response.status === 200 && count === 0);
        return `${valid ? '기대와 일치' : '기대와 다름'}: HTTP ${response.status}, 메모 ${count === null ? '배열 확인 불가' : count + '건'}`;
      });
    if (config.step >= 4) {
      const original = [];
      if (config.step >= 5) {
        const origin = new URL(config.originalApiUrl);
        if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash) {
          throw new Error('originalApiUrl은 인증정보·쿼리 없는 HTTPS 주소여야 합니다.');
        }
        original.push(await check(origin.href, 'original_api_no_credentials',
          '자격증명 없는 원본 GET은 401/403으로 거부. DB 권한 회수 검증과 구분',
          response => `HTTP ${response.status}: 자격증명 없는 원본 GET 응답만 확인. anon·authenticated DB 권한 회수 여부는 미확인`));
      }
      const zones = [];
      if (config.step === 8) {
        const fixtureId = '22222222-2222-4222-8222-222222222222';
        for (const [method, path, attackId, status, reason] of [
          ['GET', '/api/notices', 'anonymous_notice_read', 401, 'authentication_required'],
          ['POST', '/api/notices', 'notice_write_denied', 405, 'notices_read_only'],
          ['PUT', `/api/admin/notices/${fixtureId}`, 'anonymous_notice_admin', 401, 'authentication_required'],
          ['GET', `/api/instructor/materials/${fixtureId}`, 'anonymous_instructor_material', 401, 'authentication_required'],
        ]) {
          zones.push(await check(path, attackId, `${method} ${path}: HTTP ${status}, 자료 반환·변경 없음`,
            (response, data) => {
              const errorOnly = data && !Array.isArray(data)
                && Object.keys(data).length === 1 && typeof data.error === 'string';
              const reasonMatches = response.headers.get('x-denial-reason') === reason;
              return `${response.status === status && errorOnly && reasonMatches ? '기대와 일치' : '기대와 다름'}: HTTP ${response.status}, 오류 전용 응답 ${errorOnly ? '확인' : '미확인'}, 고정 사유 코드 ${reasonMatches ? '일치' : '불일치'}`;
            }, method));
        }
      }
      // No credentials or content are sent. Step 8 sends unauthenticated write
      // probes with no body; authenticated mutations remain unexecuted.
      return [api, staticFile, ...original, ...zones,
        ...(config.step >= 6 ? [
          { attackId: "registered_device_read", expected: "등록 기기의 자료실 읽기 허용", observed: "미실행: 실제 등록 기기 접속 미검증. 로컬 가상 요청 연습과 구분" },
          { attackId: "unregistered_device_read", expected: "미등록 기기 접근 거부", observed: "미실행: 미등록 기기 공격은 심판 담당. 자기 점검에서 공격하지 않음" },
        ] : []),
        ...(config.step >= 7 ? [
          { attackId: 'compound_access_step_up', expected: '복합 가상 사건은 step_up, 정상 가상 사건은 allow', observed: '미실행: 이 HTTP 자기 점검에서는 가상 판정기를 호출하지 않음. 별도 로컬 연습과 구분' },
          { attackId: 'reauthentication_gate', expected: '계약이 준비된 환경에서만 재로그인 전 자료 차단과 같은 주체의 새 로그인 후 요청 재판정·허용 실측', observed: '미실행: 제공 계약에서 같은 주체의 추가 확인 요청 이후 재로그인 시각 검증을 확인하지 못함. 실제 자료 차단·새 요청 허용 미검증' },
        ] : []),
        ...(config.step === 8 ? [
          { attackId: 'instructor_permission', expected: '저장된 활성 강사는 자료 조회·공지 수정 허용, 일반 사용자·위조 역할·회수된 권한은 거부', observed: '미실행: 실제 로그인 계정의 강사 권한 검증 없음. 로컬 모의 검사와 구분' },
          { attackId: 'resource_zone_decider', expected: '단일 메모·공지 GET 허용, 메모 목록·공지 쓰기·강사 자료·미확인 경로 거부', observed: '미실행: HTTP 자기 점검은 판정기를 호출하지 않음. 별도 가상 요청 검사와 구분' },
        ] : []),
        { attackId: 'owner_crud',
          expected: 'A/B 각각 본인 목록·한 건 GET 200, POST 201, PUT 200, DELETE 204',
          observed: '미실행: 실제 계정의 정상 CRUD는 사용자가 직접 검증 예정' },
        { attackId: 'cross_owner_access',
          expected: 'A/B 서로의 메모 GET·PUT·DELETE 404, 타인 자료 반환·변경 없음',
          observed: '미실행: 실제 계정의 타인 메모 접근은 사용자가 직접 검증 예정' },
        { attackId: 'owner_spoofing',
          expected: 'URL·본문 owner_id를 무시하고 POST·PUT 소유자는 검증된 사용자 ID 유지',
          observed: '미실행: 배포 환경 소유자 위조 검증은 사용자 수행 예정. 로컬 모의 테스트와 구분' },
        { attackId: 'anonymous_other_methods',
          expected: '비로그인 개별 GET 및 POST·PUT·DELETE는 HTTP 401',
          observed: '미실행: 메모 개별 GET 및 POST·PUT·DELETE 요청은 이번 자기 점검에서 전송하지 않음' },
        { attackId: 'database_rls',
          expected: config.step >= 5
            ? 'PUBLIC·anon·authenticated 직접 권한 없음, service_role CRUD 유지, 원본 직접 읽기·쓰기 거부'
            : 'anon 권한 없음, authenticated CRUD 및 auth.uid() 소유자 제한',
          observed: config.step === 8
            ? '미실행: 8단계 SQL 적용·강사 등록은 사용자 보고. 실제 DB 권한·RLS는 이 자기 점검에서 조회하지 않음'
            : '미실행: SQL 적용과 DB 권한·RLS 검증은 사용자가 직접 수행 예정' },
      ];
    }
    return [api, staticFile];
  }
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}
