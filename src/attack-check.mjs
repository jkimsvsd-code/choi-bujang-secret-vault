// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 2) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  if (config.step === 2) {
    // Record only status and counts, never response bodies or raw network errors.
    const check = async (path, attackId, expected, inspect) => {
      let response;
      try {
        response = await fetch(new URL(path, app), {
          redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
        });
      } catch {
        return { attackId, expected, observed: '확인 불가: 요청 실패 또는 시간 초과 (HTTP 응답 없음)' };
      }
      let data;
      try {
        data = await response.json();
      } catch {
        // An unreadable response is not evidence of an empty notes array.
      }
      return { attackId, expected, observed: inspect(response, data) };
    };
    const api = await check('/api/notes', 'anonymous_api_note_read',
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
