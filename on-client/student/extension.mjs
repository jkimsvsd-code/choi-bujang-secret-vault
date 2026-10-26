// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions }) {
      const root = document.createElement('div');
      const deviceLabels = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
      const sessionLabels = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
      const modeLabels = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      const addText = (parent, tag, text) => {
        const element = document.createElement(tag);
        element.textContent = text;
        parent.appendChild(element);
        return element;
      };
      const deviceText = (device) => `${device.label} · 기기 ID: ${device.id} · ${deviceLabels[device.status] ?? '확인 불가'} (${device.status})`;
      const sessionText = (session) => `세션 ID: ${session.id} · ${sessionLabels[session.status] ?? '확인 불가'} (${session.status})`;
      const renderResource = (title, resource, renderData) => {
        const section = document.createElement('section');
        addText(section, 'h3', title);
        if (modeLabels[resource.mode]) addText(section, 'p', modeLabels[resource.mode]);
        if (resource.status === 'loading') {
          addText(section, 'p', '불러오는 중');
        } else if (resource.status === 'error') {
          addText(section, 'p', `연결 실패: ${resource.error?.message ?? '확인 불가'}`);
        } else if (resource.status === 'ok') {
          renderData(section, resource.data);
        } else {
          addText(section, 'p', '확인 불가');
        }
        root.appendChild(section);
      };
      renderResource('현재 로그인 정보', me, (section, data) => {
        addText(section, 'p', `사용자: ${data.user.label} · 사용자 ID: ${data.user.id}`);
        addText(section, 'p', `현재 기기: ${deviceText(data.device)}`);
        addText(section, 'p', `현재 세션: ${sessionText(data.session)}`);
      });
      renderResource('기기 목록', devices, (section, data) => {
        if (data.length === 0) return addText(section, 'p', '표시할 기기가 없습니다.');
        const list = document.createElement('ul');
        for (const device of data) addText(list, 'li', deviceText(device));
        section.appendChild(list);
      });
      renderResource('세션 목록', sessions, (section, data) => {
        if (data.length === 0) return addText(section, 'p', '표시할 세션이 없습니다.');
        const list = document.createElement('ul');
        for (const session of data) addText(list, 'li', sessionText(session));
        section.appendChild(list);
      });
      return root;
    },
    renderDecision({ status, mode, data, error, appId }) {
      const root = document.createElement('div');
      const addText = (text) => {
        const element = document.createElement('p');
        element.textContent = text;
        root.appendChild(element);
      };
      if (status === 'idle') {
        addText('앱을 골라 접속을 요청하세요.');
      } else if (status === 'loading') {
        addText(`업무 앱 ID: ${appId ?? '확인 불가'}`);
        addText('판정 확인 중');
      } else if (status === 'error') {
        addText(`업무 앱 ID: ${appId ?? '확인 불가'}`);
        addText(`요청 실패: ${error?.message ?? '오류 메시지 확인 불가'}`);
        addText('요청 실패는 접근 거부 판정이 아닙니다. 접근 판정을 확인할 수 없습니다.');
      } else if (status === 'ok') {
        addText(`업무 앱 ID: ${data?.appId ?? appId ?? '확인 불가'}`);
        const labels = {
          allow: '접근 허용(allow)',
          deny: '접근 거부(deny)',
          challenge: '추가 인증 또는 확인 필요(challenge)',
          unknown: '판정 확인 불가(unknown)',
        };
        const decision = Object.hasOwn(labels, data?.decision) ? data.decision : 'unknown';
        addText(labels[decision]);
        if (decision === 'allow') addText('정책상 접근 허용이며, 실제 앱 접속 성공을 보장하지 않습니다.');
        if (decision === 'challenge') addText('이 앱은 추가 인증이나 확인 절차를 대신 수행하지 않습니다.');
        addText(`판정 이유: ${data?.reason ?? '확인 불가'}`);
        addText(`판정 시각: ${data?.checkedAt ?? '확인 불가'}`);
      } else {
        addText('판정 확인 불가(unknown)');
      }
      return root;
    },
    renderEvents({ status, mode, data, error }) {
      const root = document.createElement('div');
      const add = (parent, tag, text) => {
        const element = document.createElement(tag);
        element.textContent = text;
        parent.appendChild(element);
        return element;
      };
      if (mode === 'demo') add(root, 'p', '예제 자료');
      if (error?.code === 'CONTRACT_MISMATCH' || status === 'CONTRACT_MISMATCH') {
        add(root, 'p', `기록 확인 불가(CONTRACT_MISMATCH): ${error?.message ?? '응답 형식을 확인할 수 없습니다.'}`);
        return root;
      }
      if (status === 'error') {
        add(root, 'p', `기록을 불러오지 못했습니다: ${error?.message ?? '오류 메시지 확인 불가'}`);
        return root;
      }
      if (status !== 'ok') {
        add(root, 'p', status === 'loading' ? '기록을 불러오는 중' : '기록 조회 전 · 확인 불가');
        return root;
      }
      if (!Array.isArray(data)) {
        add(root, 'p', '기록 확인 불가(CONTRACT_MISMATCH): 기록 배열이 아닙니다.');
        return root;
      }
      const events = [...data].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      const kindText = (value) => `${value === 'access' ? '접속 기록' : value === 'xdr' ? 'XDR 경보' : '확인 불가'}(${value})`;
      const appText = (value) => value || '앱을 확인할 수 없습니다';
      const accessLabels = { allowed: '접속 허용', denied: '접속 거부', unknown: '확인 불가' };
      const stateText = (labels, value) => `${Object.hasOwn(labels, value) ? labels[value] : '확인 불가'}(${value})`;
      const filters = [
        { name: '기록 종류', read: (event) => event.kind, text: kindText },
        { name: '업무 앱', read: (event) => event.appId, text: appText },
        { name: '접속 상태', read: (event) => event.state.access, text: (value) => stateText(accessLabels, value) },
      ];
      for (const filter of filters) {
        const label = add(root, 'label', filter.name);
        filter.select = add(label, 'select', '');
        add(filter.select, 'option', '전체').value = 'all';
        for (const value of new Set(events.map(filter.read))) {
          // 값이 없는 appId에는 새 API 값을 만들지 않는다.
          if (value == null) continue;
          add(filter.select, 'option', filter.text(value)).value = value;
        }
        filter.select.addEventListener('change', () => renderList());
      }
      const count = add(root, 'p', `표시된 기록: ${events.length}건`);
      const list = add(root, 'ul', '');
      const detail = add(root, 'div', '');
      const showDetail = (event) => {
        detail.replaceChildren();
        const section = add(detail, 'section', '');
        section.setAttribute('data-student-event-detail', event.id);
        add(section, 'h3', `${event.id} 상세`);
        add(section, 'p', `사건 ID: ${event.id} · 앱: ${appText(event.appId)}`);
        for (const [title, entries] of [['근거', event.evidence], ['규칙', event.rules]]) {
          add(section, 'h4', title);
          if (entries.length === 0) add(section, 'p', `제공된 ${title}가 없습니다`);
          const items = add(section, 'ul', '');
          for (const entry of entries) add(items, 'li', `${entry.id}: ${entry.text}`);
        }
        add(section, 'h4', '상태');
        add(section, 'p', `접속 상태(access): ${stateText(accessLabels, event.state.access)}`);
        add(section, 'p', `세션 상태(session): ${stateText({ active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' }, event.state.session)}`);
        add(section, 'p', `기기 상태(device): ${stateText({ compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' }, event.state.device)}`);
        for (const action of event.supportedActions) {
          const button = add(section, 'button', `${action} 미지원`);
          button.type = 'button';
          button.disabled = true;
        }
        if (event.supportedActions.length > 0) {
          add(section, 'p', '아직 지원하지 않는 조치입니다. 조치 실행 연결은 준비 중이며 요청을 전송하지 않습니다.');
        }
      };
      const renderList = () => {
        list.replaceChildren();
        detail.replaceChildren();
        const visible = events.filter((event) => filters.every((filter) =>
          filter.select.value === 'all' || filter.read(event) === filter.select.value));
        count.textContent = `표시된 기록: ${visible.length}건`;
        if (visible.length === 0) add(list, 'li', '표시할 기록이 없습니다');
        for (const event of visible) {
          const row = add(list, 'li', `사건 ID: ${event.id} · 시각: ${event.at} · 종류: ${kindText(event.kind)} · 앱: ${appText(event.appId)} · 요약: ${event.summary}`);
          row.setAttribute('data-student-event-id', event.id);
          const button = add(row, 'button', `${event.id} 상세`);
          button.type = 'button';
          button.addEventListener('click', () => showDetail(event));
        }
      };
      renderList();
      return root;
    },
    renderStatus({ devices, sessions, notifications, diagnostics, mode }) {
      const root = document.createElement('div');
      const add = (tag, text) => {
        const element = document.createElement(tag);
        element.textContent = text;
        root.appendChild(element);
        return element;
      };
      const label = (labels, value) => Object.hasOwn(labels, value) ? labels[value] : '확인 불가';
      const modes = { connected: '연결됨', disconnected: '연결 없음', demo: '예제 자료', unknown: '확인 불가' };
      add('p', `연결 상태: ${label(modes, mode)} (${mode ?? 'unknown'})`);
      const failure = (title, resource, retry) => {
        add('p', `${title} 불러오기 실패: ${resource.error?.code ?? 'unknown'} · ${resource.error?.message ?? '확인 불가'}`);
        if (/TIMEOUT|TIMED_OUT/i.test(resource.error?.code ?? '')) add('p', '요청 시간이 초과되었습니다.');
        add('p', retry);
      };
      const renderList = (title, resource, empty, rowText) => {
        add('h3', title);
        if (resource.status === 'loading') add('p', `${title} 불러오는 중`);
        else if (resource.status === 'error') failure(title, resource, '다시 시도하려면 위쪽 다시 불러오기 버튼을 직접 누르세요.');
        else if (resource.status === 'ok') {
          if (resource.data.length === 0) add('p', empty);
          else {
            const list = add('ul', '');
            for (const row of resource.data) {
              const item = document.createElement('li');
              item.textContent = rowText(row);
              list.appendChild(item);
            }
          }
        } else add('p', `${title} 조회 전 · 확인 불가`);
      };
      renderList('기기', devices, '등록된 기기가 없습니다.', (device) =>
        `${device.label} · ${label({ compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' }, device.status)} (${device.status})`);
      renderList('세션', sessions, '현재 연결이 없습니다.', (session) =>
        `${session.id} · ${label({ active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' }, session.status)} (${session.status})`);
      add('p', '세션 조회 범위는 현재 검증된 연결 하나입니다. 지난 세션 목록이 아닙니다.');
      add('h3', '알림');
      if (notifications.length === 0) add('p', '주의할 알림이 없습니다.');
      for (const notice of notifications) add('p', `자료: ${notice.resource} · 코드: ${notice.code} · ${notice.message}`);
      add('h3', '연결 점검 도움정보');
      let safeText = '';
      if (diagnostics.status === 'ok') {
        const data = diagnostics.data;
        if (!data || Object.keys(data).length === 0) {
          add('p', '제공된 진단 정보가 없습니다.');
        } else {
          safeText = [
            `requestId: ${data.requestId ?? '확인 불가'}`,
            `component: ${data.component ?? '확인 불가'}`,
            `version: ${data.version ?? '확인 불가'}`,
            `checkedAt: ${data.checkedAt ?? '확인 불가'}`,
            `engine.mode: ${data.engine?.mode ?? 'unknown'}`,
            `engine.code: ${data.engine?.code ?? '확인 불가'}`,
          ].join('\n');
          add('pre', safeText);
        }
      } else if (diagnostics.status === 'loading') add('p', '연결 점검 도움정보 불러오는 중');
      else if (diagnostics.status === 'error') failure('연결 점검 도움정보', diagnostics, '다시 시도하려면 제공 영역의 도움정보 불러오기 버튼을 직접 누르세요.');
      else add('p', '연결 점검 전입니다. 제공 영역의 도움정보 불러오기 버튼을 누르세요.');
      add('p', '도움 요청에 사용할 위의 안전한 점검 항목만 복사합니다.');
      const copy = add('button', '도움정보 복사');
      copy.type = 'button';
      copy.disabled = safeText.length === 0;
      const copyStatus = add('p', '');
      copyStatus.setAttribute('role', 'status');
      copy.addEventListener('click', async () => {
        if (!safeText) return;
        try {
          await navigator.clipboard.writeText(safeText);
          copyStatus.textContent = '도움정보를 복사했습니다.';
        } catch {
          copyStatus.textContent = '도움정보를 복사하지 못했습니다. 위의 점검 항목을 직접 확인하세요.';
        }
      });
      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted }) {
      const root = document.createElement('div');
      root.setAttribute('role', 'status');
      const add = (text) => {
        const element = document.createElement('p');
        element.textContent = text;
        root.appendChild(element);
      };
      if (status === 'idle') add('AI 연결 점검 전');
      else if (status === 'loading') add('AI 연결 점검 중');
      else if (status === 'ok') {
        if (mode === 'demo') add('예제 응답(demo)');
        add(data.audienceAuthorization === 'test' ? '시험 연결 점검(test)' : '앱 권한 확인 후 점검(verified)');
        add(`응답 모델 수: ${data.modelCount}`);
        add(`점검 시각: ${checkedAt}`);
        add(data.audienceAuthorization === 'test'
          ? '시험 연결 결과이며, 운영 앱 권한 확인을 뜻하지 않습니다.'
          : '표시된 점검 시각 기준으로 앱 권한과 모델 목록 응답을 확인했습니다.');
        add('연결만 점검했습니다. 사건 설명은 아직 실행하지 않았습니다. 보안 기록에서 별도로 요청하고 결과를 확인하세요.');
      } else if (status === 'error') {
        // 제공 화면의 safeAiFailure가 정리한 code와 message만 받는다.
        add(`AI 연결 점검 실패: ${error.code} · ${error.message}`);
        const guidance = {
          ON_AI_PROVISIONING_PENDING: '권한 준비 중입니다. 학생 코드의 오류로 단정할 수 없습니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.',
          SUBJECT_SCOPE_UNVERIFIED: '계정 연결을 확인할 수 없습니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.',
          ON_AI_AUTHORIZATION_CHANGED: '점검 중 권한이 변경되었습니다. 담당자에게 현재 앱 권한 확인을 요청하세요.',
          WB_CLCO_AUTH_REQUIRED: '인증 실패입니다. 계정 연결을 다시 확인하고 담당자에게 문의하세요.',
          WB_CLCO_ACCESS_BLOCKED: '접근이 제한되었습니다. 계정 연결을 다시 확인하고 담당자에게 앱 권한 확인을 요청하세요.',
          WB_CLCO_COHORT_BUDGET_EXHAUSTED: '반 AI 사용량이 소진되었습니다. 담당자에게 문의하세요.',
          WB_CLCO_LIMIT_REACHED: 'AI 이용 한도에 도달했습니다. 담당자에게 문의하세요.',
          WB_CLCO_SESSION_CLOSED: '현재 이용 시간이 아닙니다. 허용된 이용 시간을 확인하세요.',
          WB_CLCO_RATE_LIMITED: '요청이 제한되었습니다. 잠시 뒤 직접 다시 점검하세요.',
          WB_CLCO_TIMEOUT: '응답 시간이 초과되었습니다. 잠시 뒤 직접 다시 점검하세요.',
          REQUEST_TIMEOUT: '응답 시간이 초과되었습니다. 잠시 뒤 직접 다시 점검하세요.',
          ENGINE_TIMEOUT: '확인 시간이 초과되었습니다. 잠시 뒤 직접 다시 점검하세요.',
          TIMEOUT: '응답 시간이 초과되었습니다. 잠시 뒤 직접 다시 점검하세요.',
          WB_CLCO_CANCELLED: '점검이 취소되었습니다. 이전 결과는 현재 결과가 아닙니다.',
          REQUEST_CANCELLED: '점검이 취소되었습니다. 이전 결과는 현재 결과가 아닙니다.',
          CANCELLED: '점검이 취소되었습니다. 이전 결과는 현재 결과가 아닙니다.',
          ON_AI_MODEL_LIST_EMPTY: '사용 가능한 모델이 없습니다. 담당자에게 모델 허용 설정 확인을 요청하세요.',
          MODEL_NOT_CONFIGURED: '사용할 모델이 설정되지 않았습니다. 담당자에게 모델 허용 설정 확인을 요청하세요.',
          AI_REQUEST_UNVERIFIED: '연결 또는 응답을 확인할 수 없습니다. 네트워크 상태를 확인하고 잠시 뒤 직접 다시 점검하세요. 계속 확인할 수 없으면 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.',
        };
        add(Object.hasOwn(guidance, error.code) ? guidance[error.code] : '결과를 확인할 수 없습니다. 담당자에게 오류 코드를 알려 확인을 요청하세요.');
      }
      add('자동으로 다시 점검하지 않습니다. 다시 점검하려면 「현재 API 연결 점검」 버튼을 직접 누르세요.');
      return root;
    },
    renderExplanation({ event, explanation, checkedAt }) {
      const root = document.createElement('div');
      root.setAttribute('aria-live', 'polite');
      const add = (text) => {
        const element = document.createElement('p');
        element.textContent = text;
        root.appendChild(element);
      };
      if (explanation.status === 'error') {
        // 제공 UI가 안전하게 정리한 오류 정보만 표시한다.
        add(`AI 설명 실패: ${explanation.error?.code ?? '오류 코드 확인 불가'} · ${explanation.error?.message ?? '실패 이유를 확인할 수 없습니다.'}`);
        add('기록은 그대로입니다. AI 연결이나 응답 실패는 과제 실패 판정이 아닙니다.');
      } else if (!event) {
        add('보안 기록에서 기록을 먼저 고르세요.');
      } else if (explanation.status === 'ok') {
        const data = explanation.data;
        const evidence = new Map(event.evidence.map((entry) => [entry.id, entry.text]));
        const fail = (reason) => {
          add(`AI 설명을 사용할 수 없습니다: ${reason}`);
          if (explanation.error?.code) add(`오류 코드: ${explanation.error.code}`);
          add('기록은 그대로입니다.');
          return root;
        };
        if (!data) return fail('설명 자료가 없습니다.');
        if (data.executed === true) return fail('AI가 이미 조치를 실행했다고 답한 설명은 사용할 수 없습니다.');
        if (evidence.size === 0 || !Array.isArray(data.evidenceIds) || data.evidenceIds.length === 0) {
          return fail('근거가 부족하여 선택한 기록의 설명을 확인할 수 없습니다.');
        }
        if (data.evidenceIds.some((id) => !evidence.has(id))
          || new Set(data.evidenceIds).size !== data.evidenceIds.length
          || data.evidenceIds.length !== evidence.size) {
          return fail('근거가 맞지 않음: 인용한 근거 ID가 현재 기록의 근거와 일치하지 않습니다.');
        }
        if (data.executed !== false || data.requiresHumanConfirmation !== true || !Array.isArray(data.proposals)) {
          return fail('제안의 미실행 상태 또는 사람 확인 필요 여부를 확인할 수 없습니다.');
        }
        if (data.proposals.some((proposal) => !event.supportedActions.includes(proposal.action)
          || !Array.isArray(proposal.evidenceIds) || proposal.evidenceIds.length === 0
          || proposal.evidenceIds.some((id) => !evidence.has(id)))) {
          return fail('제안의 조치 또는 근거가 현재 기록과 맞지 않습니다.');
        }
        root.setAttribute('data-student-explanation-event', event.id);
        add(`사건 ID: ${event.id}`);
        const heading = document.createElement('h3');
        heading.textContent = 'AI 설명(참고용)';
        root.appendChild(heading);
        add(data.summary);
        add('AI 설명은 해석입니다. 사실 판단은 근거 글과 연동 시스템이 알려 준 현재 상태를 기준으로 하세요.');
        add('인용한 근거');
        for (const id of data.evidenceIds) add(`${id} — ${evidence.get(id)}`);
        add('현재 규칙');
        if (event.rules.length === 0) add('제공된 규칙이 없습니다.');
        for (const rule of event.rules) add(`${rule.id} — ${rule.text}`);
        add('확인 불가 상태');
        const unknown = Object.entries({ access: '접속', session: '세션', device: '기기' })
          .filter(([key]) => event.state[key] === 'unknown');
        if (unknown.length === 0) add('없음');
        for (const [, label] of unknown) add(`${label}: 확인 불가(unknown)`);
        add('조치 제안');
        if (data.proposals.length === 0) {
          add(event.supportedActions.length === 0
            ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).'
            : 'AI가 제안한 조치가 없습니다.');
        }
        for (const proposal of data.proposals) {
          add(`${proposal.action} — ${proposal.reason}`);
          add(`제안 근거 ID: ${proposal.evidenceIds.join(', ')}`);
          add('사람 확인이 필요하며 실행되지 않았습니다.');
        }
        add('AI 설명·제안만으로 보안 조치가 실행되지는 않습니다. 조치는 실행되지 않았습니다.');
      } else {
        add(explanation.status === 'loading' ? '사건 설명 요청 중' : '사건 설명 요청 전');
      }
      return root;
    },
    renderAction({ status, event, actionId, target, receipt, observation, message, confirmationExpiresAt, error }) {
      // 호출마다 새 요소를 반환하며, 제공 화면이 이전 학생 표시를 교체한다.
      const root = document.createElement('div');
      root.setAttribute('role', 'status');
      const add = (text) => {
        const element = document.createElement('p');
        element.textContent = text;
        root.appendChild(element);
      };
      const field = (label, value) => {
        if (value !== undefined && value !== null) add(`${label}: ${value}`);
      };
      const labels = {
        idle: '아직 미실행(idle)',
        loading: '조치 준비 또는 결과 조회 중(loading) · 결과가 아직 확인되지 않았습니다.',
        prepared: '준비됨·미실행(prepared)',
        executing: '서버에 전달 중(executing) · 결과가 아직 없습니다.',
        pending: '서버 접수·처리 중(pending) · 접수 응답(ACK)은 효과 확인이 아닙니다. 결과가 아직 확인되지 않았습니다.',
        denied: '거절(denied)',
        failed: '실패(failed)',
        expired: '확인 기한 지남(expired) · 제공 화면에서 「조치 준비」를 다시 진행하세요.',
        error: '요청 처리 안 됨(error)',
      };
      const confirmed = status === 'succeeded' && observation?.effectApplied === true;
      if (confirmed) {
        add('효과 확인(succeeded)');
        add(`관측 시각(observation.observedAt): ${observation.observedAt ?? '확인 불가'}`);
        add('effectApplied: true');
        if (receipt?.receiptId == null) add('receiptId: 확인 불가');
      } else if (Object.hasOwn(labels, status)) {
        add(labels[status]);
      } else {
        add(`결과 불명(unknown) · 입력 status: ${status ?? '확인 불가'}`);
        add('성공이나 효과 없음으로 판단하지 마세요. 제공 화면의 「연동 시스템 결과만 재조회」를 사용하세요.');
      }
      if (event?.id != null) root.setAttribute('data-student-action-event', event.id);
      if (receipt?.requestId != null) root.setAttribute('data-student-action-request', receipt.requestId);
      field('사건 ID(event.id)', event?.id);
      for (const evidence of event?.evidence ?? []) field('근거 ID', evidence.id);
      field('조치(actionId)', actionId);
      field('실제 대상(target.id)', target?.id);
      field('대상 세대(target.generation)', target?.generation);
      field('요청 ID(requestId)', receipt?.requestId);
      field('접수 ID(receiptId)', receipt?.receiptId);
      field('결과 버전(version)', receipt?.version);
      field('확인 기한(confirmationExpiresAt)', confirmationExpiresAt);
      // 오류는 제공 화면이 안전하게 정리한 code·message만 표시한다.
      if (status === 'error') {
        field('오류 코드', error?.code);
        add(`오류 메시지: ${error?.message ?? '확인 불가'}`);
      }
      if (status === 'denied' || status === 'failed') add(`사유: ${message ?? error?.message ?? '확인 불가'}`);
      if (status === 'prepared') {
        add('AI 제안과 조치 준비만으로 실행되지 않습니다. 현재 사건·근거·조치·실제 대상·확인 기한을 확인한 뒤 제공 화면의 「대상과 조치를 확인했으며 집행합니다」를 사용하세요.');
      }
      if (event?.supportedActions?.length === 0) {
        add('현재 기록은 연동 시스템이 지원하는 조치가 없어 「조치 준비」 버튼이 표시되지 않는 것이 정상입니다.');
      }
      add('중복 집행을 요청하지 마세요. 전달된 요청은 제공 화면의 「연동 시스템 결과만 재조회」로 확인하세요.');
      add('「조치 화면 취소」는 화면을 초기화하며, 이미 서버에 전달된 조치 효과를 되돌리지 않습니다.');
      return root;
    },
  };
}
