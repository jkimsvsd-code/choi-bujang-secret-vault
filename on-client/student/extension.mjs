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
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
