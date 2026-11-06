import { cloneData } from './browser-compat.mjs';
// Fictional, browser-memory-only fixtures. No network, credentials or PC reads.
const copy = value => cloneData(value);
const failure = (code, message) => ({ ok: false, error: { code, message, retryable: false }, meta: { mode: 'disconnected', checkedAt: null } });
const cancelled = () => failure('CANCELLED', '모드가 바뀌었거나 요청을 취소했습니다. 현재 모드에서 다시 조회하세요.');

export function createDemoData({ clock = () => new Date() } = {}) {
  const now = () => clock().toISOString();
  const before = minutes => new Date(clock().getTime() - minutes * 60000).toISOString();
  const identity = { user: { id: 'example-user', label: '예제 사용자' }, device: { id: 'example-pc', label: '예제 PC', status: 'compliant' }, session: { id: 'example-session', status: 'active' } };
  const apps = [{ id: 'library', name: '예제 자료실' }, { id: 'repository', name: '예제 저장소' }, { id: 'approval', name: '예제 승인 앱' }];
  const events = [
    { id: 'example-access', kind: 'access', at: before(30), appId: 'repository', summary: '예제: 저장소 접근이 거부된 상황입니다.', evidence: [{ id: 'example-e1', text: '가상 기기 상태 확인이 필요합니다.' }], rules: [{ id: 'example-r1', text: '예제 접근 조건을 충족해야 합니다.' }], state: { access: 'denied', session: 'active', device: 'unknown' }, supportedActions: ['revoke-session'] },
    { id: 'example-alert', kind: 'xdr', at: before(60), summary: '예제: 연결된 보안 시스템에서 알림을 받은 상황입니다.', evidence: [{ id: 'example-e2', text: '실제 공격이나 PC 탐지 결과가 아닌 설명용 알림입니다.' }], rules: [{ id: 'example-r2', text: '근거를 확인한 뒤 판단합니다.' }], state: { access: 'unknown', session: 'active', device: 'unknown' }, supportedActions: [] },
  ];
  let sequence = 0, history = [], action = null;
  const pcSample = (at, index) => ({ source: 'example', queriedAt: at, saved: true, metrics: [
    { kind: 'cpu', status: 'ok', value: [24, 38, 31, 45, 27][index % 5], unit: '%', target: '예제 CPU', measuredAt: at, startedAt: new Date(Date.parse(at) - 1000).toISOString(), intervalMs: 1000 },
    { kind: 'memory', status: 'ok', value: 5 + index % 5 * .35, unit: 'GiB', target: '예제 메모리', measuredAt: at },
    { kind: 'disk', status: 'ok', value: 128 - index % 5 * .2, unit: 'GiB', target: '예제 디스크', measuredAt: at },
  ] });
  const inspectionSample = at => ({ source: 'example', queriedAt: at, saved: true, windowStart: new Date(Date.parse(at) - 86400000).toISOString(), windowEnd: at, sections: [
    { kind: 'network', status: 'ok', checkedAt: at, rows: [{ label: '예제 어댑터 주소', value: '192.0.2.10', unit: 'IPv4' }, { label: '연결 이름', value: '예제 네트워크', unit: '이름' }] },
    { kind: 'firewall', status: 'ok', checkedAt: at, rows: [{ label: '예제 프로필 활성 설정', value: 'True', unit: '설정값' }] },
    ...['system', 'application'].map((kind, i) => ({ kind, status: 'ok', checkedAt: at, rows: [{ label: '경고 (Level 3)', value: String(3 + i), unit: '건' }, { label: '오류 (Level 2)', value: String(i), unit: '건' }] })),
  ] });
  const pc = [4, 3, 2, 1].map((minutes, i) => pcSample(before(minutes), i));
  const inspections = [inspectionSample(before(60)), inspectionSample(before(30))];
  const saveEvents = at => {
    const queryId = `example-query-${++sequence}`;
    history.push(...events.map(event => ({ queryId, queriedAt: at, occurredAt: event.at, kind: event.kind, mode: 'demo' })));
    history = history.slice(-1000);
  };
  saveEvents(before(20)); saveEvents(before(10));
  return async function demoRequest(path, { method = 'GET', body = {} } = {}) {
    const ok = (data, extra = {}) => ({ ok: true, data: copy(data), meta: { mode: 'demo', checkedAt: now() }, ...extra });
    const route = `${method} ${path}`;
    switch (route) {
      case 'GET /api/me': return ok(identity);
      case 'GET /api/devices': return ok([identity.device]);
      case 'GET /api/sessions': return ok([identity.session]);
      case 'GET /api/apps': return ok(apps);
      case 'GET /api/events': saveEvents(now()); return ok(events, { history: { status: 'saved' } });
      case 'GET /api/history': return ok([...history].reverse());
      case 'POST /api/history/clear':
        if (!history.some(row => row.queryId === body.queryId)) return failure('HISTORY_CONFIRMATION_REQUIRED', '조회한 예제 이력을 확인한 뒤 삭제하세요.');
        history = []; return ok({ cleared: true });
      case 'POST /api/pc-status': { const sample = pcSample(now(), pc.length); pc.push(sample); if(pc.length>1000)pc.shift(); return ok(sample); }
      case 'GET /api/pc-status/history': return ok(pc);
      case 'POST /api/pc-inspection': { const sample = inspectionSample(now()); inspections.push(sample); if(inspections.length>1000)inspections.shift(); return ok(sample); }
      case 'GET /api/pc-inspection/history': return ok(inspections);
      case 'GET /api/pc-inspection/sdp': return ok({ status: 'disconnected', reason: '예제 시나리오: SDP 미연결. 실제 연결 상태를 조회하지 않았습니다.', checkedAt: now() });
      case 'POST /api/access': {
        if (!apps.some(app => app.id === body.appId)) return failure('APP_NOT_FOUND', '예제 앱을 선택하세요.');
        const decision = { library: 'allow', repository: 'deny', approval: 'challenge' }[body.appId];
        return ok({ appId: body.appId, decision, reason: `예제 ${decision} 판정 · 실제 업무 서비스에 연결하지 않았습니다.`, checkedAt: now() });
      }
      case 'GET /api/vulnerabilities': return ok({ source: 'example', checkedAt: now(), status: 'complete', packages: [{ name: 'example-component', version: '1.0.0', status: 'known_vulnerabilities', source: '설명용 예제 · 외부 조회 없음', checkedAt: now(), vulnerabilities: [{ id: 'EXAMPLE-001', modified: before(1440) }] }] });
      case 'GET /api/diagnostics': return ok({ component: '예제 도움정보', source: 'example', checkedAt: now(), note: '가상 자료입니다. 실제 계정·설정·기기 정보를 읽지 않았습니다.' });
      case 'POST /api/ai/check': return ok({ transportChecked: true, audienceAuthorization: 'test', modelCount: 1, help: { component: 'on-ai', code: 'ON_AI_TEST_TRANSPORT_ONLY', appCredentialsConfigured: false, provisioning: 'pending', automaticRetries: 0, workbenchRequiredAtRuntime: false } });
      case 'POST /api/ai/explain': {
        const event = events.find(row => row.id === body.eventId);
        if (!event) return failure('ON_AI_INVALID_INPUT', '예제 기록을 먼저 선택하세요.');
        return ok({ explanation: { summary: `미리 작성한 예제 설명: ${event.summary} 실제 AI 모델을 호출하지 않았습니다.`, evidenceIds: event.evidence.map(row => row.id), proposals: event.supportedActions.map(action => ({ action, evidenceIds: event.evidence.map(row => row.id), reason: '가상 세션의 조치 확인 절차를 연습합니다. 실제 변경은 없습니다.' })), requiresHumanConfirmation: true, executed: false } });
      }
      case 'POST /api/actions/prepare': {
        const event = events.find(row => row.id === body.eventId && row.supportedActions.includes(body.actionId));
        if (!event) return failure('ACTION_EVENT_UNAVAILABLE', '지원되는 예제 조치를 선택하세요.');
        action = { requestId: '00000000-0000-4000-8000-000000000001', receiptId: '00000000-0000-4000-8000-000000000002', eventId: event.id, actionId: body.actionId, status: 'prepared', version: 1, replayed: false };
        return ok({ ...action, confirmationId: 'ac-on-' + 'd'.repeat(43), confirmationExpiresAt: new Date(clock().getTime() + 120000).toISOString(), target: { id: 'subject:example-user', generation: 1 } });
      }
      case 'POST /api/actions/execute':
        if (!action || action.status !== 'prepared' || body.requestId !== action.requestId || body.confirmationId !== 'ac-on-' + 'd'.repeat(43)) return failure('ACTION_CONFIRMATION_INVALID', '예제 조치도 준비와 확인 절차가 필요합니다.');
        action = { ...action, status: 'pending', version: 2 }; return ok(action);
      case 'POST /api/actions/result':
        if (!action || body.requestId !== action.requestId || action.status === 'prepared') return failure('ACTION_EVENT_UNAVAILABLE', '확인한 예제 조치가 없습니다.');
        action = { ...action, status: 'succeeded', version: 3, observation: { observedAt: now(), effectApplied: true } }; return ok(action);
      default:
        if (method === 'POST' && /^\/api\/(native-login|ai\/connect)\/(start|current|status|redeem|finish|cancel)$/.test(path)) return ok({ example: true, step: path.split('/').pop(), checkedAt: now() });
        return failure('DEMO_UNSUPPORTED', '이 기능의 예제는 준비되지 않았습니다. 실제 조회로 대신 실행하지 않습니다.');
    }
  };
}

// Each mounted view captures an epoch. Late responses and follow-up requests
// from an old view cannot cross from demo into the real transport (or vice versa).
export function createDisplayMode({ actualRequest, clock } = {}) {
  let mode = 'actual', epoch = 0;
  const controllers = new Set(), demoRequest = createDemoData({ clock });
  async function scopedRequest(expectedEpoch, path, options = {}) {
    if (expectedEpoch !== epoch || options.signal?.aborted) return cancelled();
    const controller = new AbortController(), activeMode = mode;
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    controllers.add(controller);
    let stop;
    const stopped = new Promise(resolve => { stop = () => resolve(cancelled()); controller.signal.addEventListener('abort', stop, { once: true }); });
    try {
      const work = activeMode === 'demo' ? demoRequest : actualRequest;
      const result = await Promise.race([Promise.resolve().then(() => {
        if (controller.signal.aborted || expectedEpoch !== epoch) return cancelled();
        return work(path, { ...options, signal: controller.signal });
      }), stopped]);
      if (controller.signal.aborted || expectedEpoch !== epoch) return cancelled();
      if (activeMode === 'actual' && (result?.meta?.mode === 'demo' || result?.data?.source === 'example' || Array.isArray(result?.data) && result.data.some(row => row?.source === 'example' || row?.mode === 'demo'))) {
        return failure('REAL_SOURCE_UNAVAILABLE', '확인 불가 · 실제 자료로 확인할 수 없는 응답입니다. 담당자에게 원천 연결 환경을 확인하세요.');
      }
      return result;
    } finally {
      controllers.delete(controller); options.signal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', stop);
    }
  }
  return {
    get mode() { return mode; }, get epoch() { return epoch; },
    setMode(next) {
      if (!['actual', 'demo'].includes(next)) throw Error('INVALID_DISPLAY_MODE');
      if (mode === next) return;
      mode = next; ++epoch;
      for (const controller of controllers) controller.abort();
    },
    request(path, options) { return scopedRequest(epoch, path, options); },
    bindRequest() { const current = epoch; return (path, options) => scopedRequest(current, path, options); },
    // Preserve the native login transport's status, raw metadata, size limits
    // and redirect checks. Its controller owns cancellation/body consumption.
    guardActualFetch(fetchImpl) {
      return async (path, options) => {
        const current=epoch;
        const rejected=()=>new Response(JSON.stringify(cancelled()),{status:503,headers:{'content-type':'application/json'}});
        if(mode!=='actual'||options?.signal?.aborted)return rejected();
        const response=await fetchImpl(path,options);
        if(current!==epoch||mode!=='actual'){
          response.body?.cancel().catch(()=>{});
          return rejected();
        }
        return response;
      };
    },
  };
}
