// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView({api} = {}) {
  const legacy = {
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
      addText('업무 앱에서는 사용할 앱을 선택해 접속 가능 여부와 허용·거부 이유를 확인합니다. 접속 허용은 실제 서비스 연결 완료와 다를 수 있습니다.');
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
      add(root, 'p', '보안 기록에서는 받아 온 사건·접속 기록과 이전 조회 이력을 살펴봅니다. 기록 건수는 공격 확정 건수가 아닙니다.');
      const sourceText = mode === 'demo'
        ? '예제 자료 · 설명용 값이며 실제 PC 조회 결과가 아닙니다.'
        : mode === 'connected'
          ? '연결 원천 자료 · 이 PC 전체의 보안 상태를 측정한 결과는 아닙니다.'
          : '실제 조회 미확인 · 자료 출처를 확인할 수 없습니다.';
      add(root, 'p', sourceText);
      if (error?.code === 'CONTRACT_MISMATCH' || status === 'CONTRACT_MISMATCH') {
        add(root, 'p', `기록 확인 불가(CONTRACT_MISMATCH): ${error?.message ?? '응답 형식을 확인할 수 없습니다.'}`);
        return root;
      }
      if (status === 'error') {
        add(root, 'p', `기록을 불러오지 못했습니다: ${error?.message ?? '오류 메시지 확인 불가'} · 다음: 연결 상태를 확인한 뒤 위쪽 다시 불러오기를 누르세요.`);
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
      add(root, 'h3', '이번에 받은 보안 기록');
      add(root,'p',`이번 조회 ${events.length}건 · 접속 기록 ${events.filter(e=>e.kind==='access').length}건 · XDR 경보 ${events.filter(e=>e.kind==='xdr').length}건 · 경보 수는 공격 확정 건수가 아닙니다.`);
      add(root, 'p', '이 목록은 이번 응답만 사건 발생 시각 최신순으로 표시합니다. 이전 조회의 시각·종류·출처는 아래 ‘내가 조회한 이력’에서 확인하세요. 사건 발생 시각은 사건이 일어난 때이며, 조회 시각은 내가 기록을 불러온 때입니다. 저장 이력에는 사건 원문을 보관하지 않습니다.');
      const kindText = (value) => `${value === 'access' ? '접속 기록' : value === 'xdr' ? 'XDR 경보' : '확인 불가'}(${value})`;
      const appText = (value) => value || '앱을 확인할 수 없습니다';
      const accessLabels = { allowed: '접속 허용', denied: '접속 거부', unknown: '확인 불가' };
      const stateText = (labels, value) => `${Object.hasOwn(labels, value) ? labels[value] : '확인 불가'}(${value})`;
      const filters = [
        { name: '기록 종류', read: (event) => event.kind, text: kindText },
        { name: '업무 앱', read: (event) => event.appId, text: appText },
        { name: '접속 상태', read: (event) => event.state.access, text: (value) => stateText(accessLabels, value) },
      ];
      let extra;
      for (const filter of filters) {
        if(filter===filters[1]){extra=add(root,'details','');add(extra,'summary','추가 필터 · 업무 앱 / 접속 상태');}
        const label = add(filter===filters[0]?root:extra, 'label', filter.name); label.className = 'student-filter';
        filter.select = add(label, 'select', '');
        filter.select.setAttribute('aria-label', filter.name);
        add(filter.select, 'option', '전체').value = 'all';
        for (const value of new Set(events.map(filter.read))) {
          // 값이 없는 appId에는 새 API 값을 만들지 않는다.
          if (value == null) continue;
          add(filter.select, 'option', filter.text(value)).value = value;
        }
        filter.select.addEventListener('change', () => renderList());
      }
      const count = add(root, 'p', `표시된 기록: ${events.length}건`);
      count.setAttribute('aria-live', 'polite');
      const reset = add(root, 'button', '필터 초기화');
      reset.type = 'button'; reset.className = 'btn';
      reset.addEventListener('click', () => {
        for (const filter of filters) filter.select.value = 'all';
        renderList();
      });
      const list = add(root, 'ol', '');
      list.setAttribute('aria-label', '사건 발생 시각순 기록 타임라인');
      const showDetail = (event,detail) => {
        const section = add(detail, 'section', '');
        section.setAttribute('data-student-event-detail', event.id);
        add(section, 'h3', `${event.id} 상세`);
        add(section, 'p', sourceText);
        add(section, 'p', `사건 발생 시각: ${event.at}`);
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
        const visible = events.filter((event) => filters.every((filter) =>
          filter.select.value === 'all' || filter.read(event) === filter.select.value));
        count.textContent = `표시된 기록: ${visible.length}건 · 이번 조회 ${events.length}건 중`;
        if (visible.length === 0) add(list, 'li', events.length === 0 ? '표시할 기록이 없습니다' : '선택한 조건에 맞는 기록이 없습니다. 필터 초기화로 전체 기록을 확인하세요.');
        for (const event of visible) {
          const row = add(list, 'li', '');
          row.style.borderInlineStart = '3px solid currentColor';
          row.style.padding = '0.5rem 1rem';
          row.style.marginBlock = '0.75rem';
          add(row, 'p', `사건 발생 시각: ${event.at}`);
          add(row, 'h4', event.summary);
          add(row, 'p', `${kindText(event.kind)} · ${stateText(accessLabels,event.state.access)} · ${mode==='demo'?'예제':mode==='connected'?'연결 원천':'출처 확인 불가'}`);
          row.setAttribute('data-student-event-id', event.id);
          const detail=add(row,'details','');detail.open=false;
          add(detail,'summary',`${event.id} 상세 · 근거와 상태`);
          showDetail(event,detail);
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
      copy.type = 'button'; copy.className = 'btn';
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
    renderVulnerabilities({ status, mode, data, error }) {
      const root = document.createElement('div');
      root.setAttribute('aria-live', 'polite');
      const add = (parent, tag, text) => {
        const element = document.createElement(tag);
        element.textContent = text;
        parent.appendChild(element);
        return element;
      };
      if (mode === 'demo') add(root, 'p', '예제 자료(demo)');
      if (status !== 'ok') {
        const message = status === 'idle' ? '조회 전(idle)'
          : status === 'loading' ? '조회 중(loading)'
          : status === 'error' ? `조회 실패(error): ${error?.message ?? '오류 메시지 확인 불가'}`
          : '조회 상태 확인 불가';
        add(root, 'p', message);
        return root;
      }
      const scanLabels = {
        complete: '모두 조회',
        partial: '일부 조회 실패',
        not_checked: '아직 조회 안 함 · 승인된 공개 조회 대상 없음',
        not_configured: '조회 대상 프로젝트 설정 필요',
        unverifiable: 'lock 파일 확인 불가',
      };
      if (!data || !Object.hasOwn(scanLabels, data.status) || !Array.isArray(data.packages)) {
        add(root, 'p', '조회 결과 확인 불가: 응답 형식을 확인할 수 없습니다.');
        return root;
      }
      add(root, 'p', `${scanLabels[data.status]}(${data.status})`);
      add(root, 'p', '조회 대상은 package-lock.json과 설치된 node_modules의 메타데이터를 대조한 패키지이며, 담당자가 허용한 공개 패키지만 OSV에서 조회합니다.');
      const field = (parent, label, value) => {
        if (value !== undefined && value !== null) add(parent, 'p', `${label}: ${value}`);
      };
      field(root, 'lock 파일 형식 버전(lockfileVersion)', data.lockfileVersion);
      field(root, 'lock 파일 해시(lockfileHash)', data.lockfileHash);
      field(root, '확인 시각(checkedAt)', data.checkedAt);
      add(root, 'p', 'OSV는 알려진 취약점 데이터베이스입니다. 조회 범위에서 알려진 항목이 없더라도 패키지나 앱 전체의 안전을 보장하지 않습니다.');
      if (data.packages.length === 0) {
        add(root, 'p', '표시할 패키지 결과가 없습니다. 미조회·확인 불가 상태는 취약점 없음이 아닙니다.');
        return root;
      }
      const table = add(root, 'table', '');
      add(table, 'caption', '설치 패키지의 정확한 버전과 OSV 조회 결과');
      const header = add(add(table, 'thead', ''), 'tr', '');
      for (const title of ['패키지 이름(name)', '설치 버전(version)', '조회 상태(status)', '출처(source)', '확인 시각(checkedAt)', '취약점']) {
        add(header, 'th', title).setAttribute('scope', 'col');
      }
      const body = add(table, 'tbody', '');
      const packageLabels = {
        known_vulnerabilities: '알려진 항목 있음',
        none_found: '조회 범위에서 알려진 항목 없음',
        unverifiable: '조회 확인 불가',
      };
      for (const pkg of data.packages) {
        const row = add(body, 'tr', '');
        if (pkg.name != null) row.setAttribute('data-student-package-name', pkg.name);
        if (pkg.version != null) row.setAttribute('data-student-package-version', pkg.version);
        add(row, 'td', pkg.name ?? '이름 미제공');
        add(row, 'td', pkg.version ?? '설치 버전 미제공');
        const findings = pkg.vulnerabilities ?? [];
        const label = pkg.status === 'unverifiable' && findings.length > 0
          ? '일부 확인 · 전체 조회 확인 불가'
          : packageLabels[pkg.status] ?? '조회 상태 확인 불가';
        add(row, 'td', `${label}(${pkg.status})`);
        add(row, 'td', pkg.source ?? '출처 미제공');
        add(row, 'td', pkg.checkedAt ?? '확인 시각 미제공');
        const details = add(row, 'td', '');
        for (const finding of findings) {
          const item = add(details, 'div', '');
          field(item, '취약점 ID(id)', finding.id);
          field(item, '수정 시각(modified)', finding.modified);
        }
        if (findings.length === 0) add(details, 'p', pkg.status === 'none_found'
          ? '조회 범위에서 알려진 항목이 없습니다.' : '제공된 취약점 항목이 없습니다. 취약점 없음으로 판단할 수 없습니다.');
      }
      return root;
    },
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
  return attachDashboard(legacy,api);

}


// Only the provided student GET capability is used. No common DOM, CSS or PC APIs.
function attachDashboard(legacy,api){
  const add=(parent,tag,text)=>{const node=document.createElement(tag);node.textContent=text;parent.appendChild(node);return node;};
  const stamp=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':'제공되지 않음';
  const source=r=>r?.mode==='demo'?'예제 자료 · 설명용이며 실제 PC 조회값이 아닙니다.':r?.mode==='connected'?'연결 원천 자료 · PC 실측 및 터널 연결 성공과 별개입니다.':'출처 확인 불가 · 연결 상태를 확인하세요.';
  const root=document.createElement('div');root.setAttribute('data-student-dashboard','true');
  root.tabIndex=-1;
  legacy.renderGuide=()=>{
    const container=document.createElement('div');
    add(container,'h2','앱 목적');
    add(container,'p','케셰브vJ는 내 PC 상태와 연결된 서비스의 보안 기록을 확인하는 앱입니다. 실시간 보호나 안전을 보장하는 판정은 아닙니다.');
    add(container,'p','PC가 느리거나, 업무 사이트에 들어가지 못하거나, 이전과 무엇이 달라졌는지 궁금할 때 사용하세요. 관련 수치와 기록을 한곳에서 확인하고 담당자에게 상황을 설명하는 데 도움이 됩니다. 백신이나 자동 수리 도구는 아닙니다.');
    const situations=add(container,'ul','');
    add(situations,'li','PC가 느릴 때 → 보호 현황에서 CPU·메모리·남은 저장 공간을 확인합니다. 수치만으로 원인을 확정하지는 않습니다.');
    add(situations,'li','업무 앱에 접속하지 못할 때 → 업무 앱에서 이용 가능 여부와 거부 이유를 확인합니다. 조직의 연결 설정과 권한이 준비되어 있어야 합니다.');
    add(situations,'li','전에 본 결과와 비교하거나 도움을 요청할 때 → 보안 기록과 조회 이력에서 시각·종류·출처를 확인합니다.');
    add(container,'h2','처음 할 일');
    const firstSteps=add(container,'ol','');
    add(firstSteps,'li','처음이라면 ‘내 PC 상태 측정’을 눌러 보세요. 첫 팝업의 시작하기는 이 버튼으로 이동만 하며 자동 측정하지 않습니다.');
    add(firstSteps,'li','보호 현황에서 측정값의 출처·확인 시각·단위를 확인하세요. 읽지 못한 값은 확인 불가로 표시합니다.');
    add(firstSteps,'li','필요에 따라 업무 앱에서 접속을 요청하거나 보안 기록에서 사건 상세와 이전 조회 이력을 살펴보세요.');
    add(container,'h2','탭별 역할');
    add(container,'p','현재 상태는 보호 현황, 업무 접속은 업무 앱, 사건과 조회 이력은 보안 기록에서 확인하세요.');
    const roles=add(container,'ul','');
    add(roles,'li','보호 현황에서는 내 PC와 서비스의 최근 확인 상태를 살펴봅니다.');
    add(roles,'li','업무 앱에서는 접속 가능 여부와 허용·거부 이유를 확인합니다. 허용은 실제 서비스 연결 완료와 다를 수 있습니다.');
    add(roles,'li','보안 기록에서는 이번 응답과 이전 조회 이력을 확인합니다. 사용 안내에서는 이 설명을 언제든 다시 읽을 수 있습니다.');
    const featureGroups=[
      ['보호 현황 · 세부 기능',[
        ['PC 측정·추이·이력','PC가 느리거나 저장 공간이 부족한지 궁금할 때, 보호 현황에서 내 PC 상태 측정을 누르세요. CPU는 계산 작업이 얼마나 바쁜지(%), 메모리는 작업용 공간을 얼마나 쓰는지, 디스크는 파일을 저장할 공간이 얼마나 남았는지(GiB)를 보여 줍니다. GiB는 공간 크기를 나타내는 단위입니다. 높은 값 하나만 보고 고장이나 공격이라고 판단하지 마세요. 이후 다시 측정하면 그래프와 항목별 접이식 표로 시각·직전 유효 값 대비 변화를 비교합니다. PC 측정 이력 조회는 저장 기록만 불러오며 새 측정이 아닙니다.'],
        ['PC 구성·Windows 기록','인터넷 연결 문제나 Windows 오류가 반복되어 담당자에게 상황을 설명하려면, 보호 현황의 PC 구성·기록 조회를 누르세요. 네트워크는 연결 주소 등의 정보, 방화벽은 통신을 허용하거나 막는 규칙의 설정입니다. System은 Windows 시스템, Application은 프로그램이 남긴 기록입니다. 일반 권한으로 네트워크·방화벽 설정과 System·Application의 최근 24시간 경고·오류 건수를 읽습니다. 종류 필터·최신 카드·접이식 표로 비교하고, PC 구성 이력 조회로 과거 결과를 봅니다. 설정을 변경하지 않으며 겹치는 24시간 건수는 합산하지 않습니다.'],
        ['SDP 연결 상태','조직의 업무 서비스에 연결되어 있는지 궁금하면 보호 현황의 SDP 상태 확인을 누르세요. 여기서 SDP는 조직이 사용하는 업무 서비스 연결 방식입니다. 조직 연결이 준비되지 않은 예제 실행에서는 연결 성공을 기대하지 않습니다. 실제 연결 근거가 없으면 미연결 또는 확인 불가로 읽고, PC 조회 성공을 연결 성공으로 해석하지 않습니다.'],
        ['로그인·기기·세션과 재조회','다른 계정이나 기기의 결과를 보고 있지 않은지 확인하려면, 보호 현황의 현재 로그인·내 기기·내 세션을 보세요. 세션은 서버가 관리하는 로그인 상태를 뜻합니다. 내 보안 현황의 대상별 다시 조회는 해당 학생 카드 자료를 갱신합니다. 출처·시각과 접힌 상세를 확인하며 예제 활성 세션을 실제 로그인 증거로 사용하지 않습니다.'],
        ['패키지·취약점','앱을 구성하는 소프트웨어 부품(패키지)에 알려진 보안 약점(취약점)이 있는지 확인할 때 사용합니다. 보호 현황에서 패키지 조회를 누르세요. 담당자가 조회 대상과 정확한 설치 버전 목록(lock 파일), 공개 조회 승인을 준비해야 합니다. 설정 필요가 나오면 담당자에게 대상 준비를 요청하세요. PC 전체 프로그램 검사로 해석하지 말고 패키지별 출처·상태를 확인하세요. 미설정·실패는 취약점 없음이 아닙니다.'],
        ['계정·AI 연결과 도움정보','내 계정의 자료나 AI의 기록 설명을 이용하고 싶을 때 설정합니다. 보호 현황의 계정 연결과 AI 연결 안내에 따라 각각 승인하세요. 조직이나 제공자가 설정을 준비하지 않았다면 담당자에게 확인하세요. 제공된 승인 페이지에서 확인하고 앱으로 돌아와 연결 확인·점검을 누릅니다. 설정과 권한이 준비되어야 하며 계정 연결과 AI 승인은 별도입니다. 문제 원인을 전달하려면 도움정보를 불러와 내용을 확인한 뒤 복사합니다. 자동 전송하지 않습니다.']]],
      ['업무 앱 · 세부 기능',[
        ['접속 요청과 판정','업무 사이트에 바로 접속했는데 사용할 수 없는 이유가 궁금하거나 조직에서 이 앱으로 접근 상태를 확인하라고 안내했을 때 사용하세요. 업무 앱 탭에서 원하는 앱을 선택하면, 연결된 계정·기기로 이용할 수 있는지와 허용·거부 이유를 한곳에서 확인할 수 있습니다. 이미 직접 접속이 잘 되고 조직의 별도 지침이 없다면 반드시 이 탭을 거칠 필요는 없습니다. 이 앱을 거친다고 항상 더 안전해지거나 자동으로 실제 서비스가 열리는 것은 아닙니다. 허용은 이용 가능 판정, 거부는 제공된 이유를 확인할 상태, 추가 확인은 별도 인증 등의 절차가 필요한 상태입니다. 조회 실패는 거부와 다르므로 연결을 확인한 뒤 다시 요청하세요. 이해하기 어려운 거부 이유는 담당자에게 문의하고 보안 설정을 임의로 바꾸지 마세요. 실제 판정에는 연결과 권한이 필요하며 예제 결과는 연습용입니다.']]],
      ['보안 기록 · 세부 기능',[
        ['사건 상세와 필터','접속이 막힌 이유나 경보에 적힌 내용을 확인하려면, 보안 기록의 이번에 받은 보안 기록에서 종류를 고르고 해당 기록 아래 상세를 펼치세요. XDR 경보는 연결된 보안 시스템에서 받은 알림이며 공격이 확정되었다는 뜻은 아닙니다. 사건 발생 시각순으로 근거·상태를 확인하며, 추가 필터로 업무 앱·접속 상태를 좁힙니다. 기록 건수는 공격 확정 건수가 아닙니다.'],
        ['내가 조회한 이력','사용자가 이전에 언제 어떤 기록을 조회했는지 확인할 때, 보안 기록의 내가 조회한 이력에서 최신순 조회 시각 묶음을 펼칩니다. 이력 다시 불러오기와 종류 필터로 발생 시각·종류·출처를 확인합니다. 같은 사건이 여러 조회에 반복될 수 있고 원문은 저장하지 않습니다. 삭제가 필요할 때만 이력 관리에서 범위를 읽고 확인 후 삭제하며, 필터와 무관하게 현재 계정·모드 전체 이력에 적용됩니다.'],
        ['AI 사건 설명','기록의 표현이 어려워 설명이 필요하면, 보안 기록의 해당 기록에서 AI 설명을 요청하고 학생 AI 사건 설명을 확인하세요. AI 설명은 참고 자료이므로 실제 기록과 함께 읽고, 판단이 어려우면 담당자에게 확인하세요. AI 연결·권한과 지원 기록이 필요하며 실패해도 원본 기록은 유지됩니다. 설명은 실제 조치 완료나 공격 확정 판정이 아닙니다.'],
        ['조치 준비·확인·결과','조치는 연결된 시스템에 실제 변경을 요청하는 기능입니다. 일반 사용자는 의미나 대상을 모르면 실행하지 말고 담당자에게 확인하세요. 권한 있는 사용자가 지원되는 사건의 조치를 검토할 때, 보안 기록에서 조치를 준비하고 실제 대상·내용·확인 기한을 읽은 뒤 별도로 확인합니다. 원천 시스템의 지원과 권한이 있어야 하며 설명 조회만으로 집행하지 않습니다. 결과 재조회로 원천 상태를 확인하고, 접수 응답·시간 초과를 완료로 해석하지 않습니다. 화면 취소는 이미 전달된 조치를 되돌리지 않습니다.']]],
      ['사용 안내 · 세부 기능',[
        ['첫 팝업과 키보드','처음 온 사용자가 기능 위치를 알고 싶을 때 첫 팝업을 읽고 시작하기를 누르면 PC 측정 버튼으로 이동합니다. 측정은 직접 눌러야 실행되고 Esc는 팝업만 닫습니다. 다시 설명이 필요하면 사용 안내 탭을 엽니다. 메뉴는 방향키·Home·End, 일반 이동은 Tab·Shift+Tab, 버튼과 접이식 설명은 Enter·Space로 조작합니다. 더 이상 보지 않기는 같은 브라우저·주소에서만 기억합니다.']]]
    ];
    for(const [title,features] of featureGroups){
      const details=add(container,'details','');details.className='student-guide-features';add(details,'summary',title);
      for(const [name,description] of features){add(details,'h3',name);add(details,'p',description);}
    }
    add(container,'h2','결과 읽는 법');
    const reading=add(container,'ul','');
    add(reading,'li','예제는 설명용입니다. 실제 PC 조회값은 출처·시각·단위를 함께 확인하세요. 예제 기록과 SDP 연결 상태는 별도입니다. PC 조회 성공이 SDP 연결 성공을 뜻하지 않습니다.');
    add(reading,'li','조회 전은 아직 확인하지 않았다는 뜻이고, 확인 불가는 값을 읽지 못했다는 뜻입니다. 안전하다는 뜻이나 0이 아닙니다. 실패한 항목과 이유를 읽고 안내된 방법으로 다시 조회하세요. 계속 실패하면 도움정보를 확인한 뒤 담당자에게 문의하세요.');
    add(reading,'li','사건 발생 시각과 내가 조회한 시각은 다릅니다. 기록 건수는 공격 확정 건수가 아니며, 과거 이력은 현재 상태가 아닙니다.');
    add(container,'p','첫 팝업의 더 이상 보지 않기는 같은 브라우저·주소(포트 포함)에 저장됩니다. 시작하기는 PC 측정 버튼으로 이동하고, Esc는 팝업만 닫습니다. 팝업을 숨겨도 이 탭에서 안내를 읽을 수 있습니다.');
    return container;
  };
  const guideKey='keshev.student.onboarding.hidden.v1';
  const guide=add(root,'dialog','');guide.setAttribute('aria-label','케셰브vJ 첫 사용 안내');
  Object.assign(guide.style,{position:'fixed',inset:'0',margin:'auto',maxWidth:'36rem',width:'calc(100% - 3rem)',maxHeight:'80vh',overflow:'auto',padding:'24px',border:'1px solid var(--border, #ccd1d8)',borderRadius:'12px',background:'var(--surface, #fff)',color:'inherit'});
  add(guide,'h2','케셰브vJ 사용 안내');
  add(guide,'p','이 PC 사용자가 상태나 접속 문제를 확인할 때 쓰는 앱입니다. 아래 탭에서 직접 조회하고 사용 안내에서 자세한 방법을 확인하세요.');
  const steps=add(guide,'ul','');
  add(steps,'li','보호 현황: PC·기기·세션의 최근 상태를 확인합니다. 처음이라면 내 PC 상태 측정을 눌러 보세요.');
  add(steps,'li','업무 앱: 접속 가능 여부와 허용·거부 이유를 확인합니다. 허용은 실제 연결 완료를 뜻하지 않습니다.');
  add(steps,'li','보안 기록: 이번에 받은 사건과 이전 조회 이력을 확인합니다. 기록 건수는 공격 확정 건수가 아닙니다.');
  add(guide,'p','예제는 설명용입니다. 실제 PC 조회값은 출처·시각·단위를 확인하세요. 확인 불가와 SDP 미연결은 별도로 표시됩니다.');
  const preference=add(guide,'label',''),hide=add(preference,'input','');hide.type='checkbox';
  add(preference,'span',' 더 이상 보지 않기');
  add(guide,'p','이 선택은 같은 브라우저·주소(포트 포함)에 저장됩니다. 저장소를 지우면 다시 나타납니다. 사용 안내 탭에서 언제든 내용을 확인할 수 있습니다.');
  const dismiss=add(guide,'button','시작하기');dismiss.type='button';dismiss.className='btn';Object.assign(dismiss.style,{font:'inherit',padding:'10px 18px',borderRadius:'var(--radius, 8px)',border:'1px solid var(--accent, #2357c6)',background:'var(--accent, #2357c6)',color:'#fff',cursor:'pointer'});dismiss.setAttribute('data-guide-control','true');
  const guideStatus=add(root,'p','');guideStatus.setAttribute('role','status');
  let autoAttempted=false,returnFocus=null;
  const readPreference=()=>{try{return globalThis.localStorage?.getItem(guideKey)==='true';}catch{return false;}};
  function openGuide(){
    if(guide.open)return;
    hide.checked=readPreference();returnFocus=document.activeElement;
    if(typeof guide.showModal!=='function'){guideStatus.textContent='이 브라우저는 안내 팝업을 지원하지 않습니다. 사용 안내 탭을 확인하세요.';return;}
    guide.showModal();dismiss.focus();
  }
  function closeGuide(){
    try{
      if(!globalThis.localStorage)throw Error();
      if(hide.checked)globalThis.localStorage.setItem(guideKey,'true');else globalThis.localStorage.removeItem(guideKey);
      guideStatus.textContent=hide.checked?'다음 방문부터 자동 안내를 표시하지 않습니다. 사용 안내 탭에서 내용을 확인할 수 있습니다.':'';
    }catch{guideStatus.textContent='안내 선택을 저장하지 못했습니다. 다음 방문에 안내가 다시 나타날 수 있습니다.';}
    guide.close();
    const target=returnFocus?.isConnected&&typeof returnFocus.focus==='function'&&returnFocus!==document.body?returnFocus:root;
    target.focus();
  }
  dismiss.addEventListener('click',()=>{
    closeGuide();
    try{
      if(api?.focusPcMeasurement?.()!==true)guideStatus.textContent+=' 보호 현황의 내 PC 상태 측정 버튼을 직접 찾아 눌러 주세요. 자동 측정은 하지 않았습니다.';
    }catch{guideStatus.textContent+=' PC 측정 버튼으로 이동하지 못했습니다. 보호 현황에서 직접 선택하세요.';}
  });
  guide.addEventListener('cancel',event=>{event.preventDefault();closeGuide();});
  const showFirstGuide=()=>{if(!autoAttempted&&root.isConnected){autoAttempted=true;if(!readPreference())openGuide();}};
  const configs=[
    {key:'identity',title:'기기·세션',detail:'기기·세션 상세',paths:['/api/me','/api/devices','/api/sessions'],labels:['로그인','기기','세션']},
    {key:'events',title:'보안 기록',detail:'기록 보기',paths:['/api/events'],labels:['보안 기록']},
    {key:'vulnerabilities',title:'패키지·취약점',buttonLabel:'패키지',detail:'패키지별 결과',paths:['/api/vulnerabilities'],labels:['설치 패키지·취약점']},
  ];
  const panels=new Map();
  for(const config of configs){
    const section=add(root,'section','');section.setAttribute('aria-label',config.title);
    Object.assign(section.style,{border:'1px solid var(--border, #ccd1d8)',borderRadius:'12px',padding:'16px',marginBlock:'14px',background:'var(--surface, #fff)',overflowWrap:'anywhere'});
    const heading=add(section,'h4',config.title);heading.style.margin='0 0 10px';
    const status=add(section,'p','조회 전');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.fontWeight='600';
    const provenance=add(section,'p','출처 확인 전');provenance.style.fontSize='.85rem';
    const checked=add(section,'p','확인 시각: 제공되지 않음');checked.style.fontSize='.85rem';
    const advice=add(section,'p','');
    const targetLabel=config.buttonLabel||config.title;
    const button=add(section,'button',`${targetLabel} 다시 조회`);button.type='button';button.setAttribute('aria-label',`${targetLabel} 다시 조회`);
    Object.assign(button.style,{padding:'8px 14px',border:'1px solid currentColor',borderRadius:'6px',background:'transparent',color:'inherit',font:'inherit',cursor:'pointer'});
    const details=add(section,'details','');details.style.marginTop='12px';details.open=false;add(details,'summary',config.detail);
    const body=add(details,'div','');
    const panel={...config,section,button,status,provenance,checked,advice,details,body,generation:0,busy:false,signature:null};panels.set(config.key,panel);
    button.addEventListener('click',async()=>{
      if(panel.busy)return;
      if(typeof api?.get!=='function'){status.textContent='조회 불가 · 학생 조회 API가 없습니다. 실행 버전과 학생 API 지원을 확인하세요.';return;}
      const generation=++panel.generation;panel.busy=true;button.setAttribute('aria-disabled','true');section.setAttribute('aria-busy','true');
      button.textContent=`${targetLabel} 조회 중…`;status.textContent=`${config.labels.join('·')} 조회 중…`;provenance.textContent='출처: 응답 대기';checked.textContent='확인 시각: 응답 대기';advice.textContent='완료까지 기다려 주세요. 이전 결과는 현재 결과로 표시하지 않습니다.';body.replaceChildren();
      const results=await Promise.all(config.paths.map(async path=>{
        let timer;
        try{return await Promise.race([Promise.resolve().then(()=>api.get(path)),new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,error:{code:'TIMEOUT'}}),12000);})]);}
        catch{return {ok:false,error:{code:'REQUEST_FAILED'}};}finally{clearTimeout(timer);}
      }));
      if(generation!==panel.generation)return;
      panel.busy=false;button.textContent=`${targetLabel} 다시 조회`;button.removeAttribute('aria-disabled');section.setAttribute('aria-busy','false');
      const resources=results.map(r=>r?.ok===true?{status:'ok',mode:r.meta?.mode,data:r.data,checkedAt:r.meta?.checkedAt}:{status:'error',error:{code:r?.error?.code||'INVALID_RESPONSE'}});
      display(panel,resources,true);
    });
  }
  function display(panel,resources,queried=false){
    panel.body.replaceChildren();let failures=0,waiting=0;const summaries=[],problems=[];
    for(const [index,r] of resources.entries()){
      const label=panel.labels[index];add(panel.body,'h5',label);add(panel.body,'p',panel.key==='vulnerabilities'?'패키지 조회 상태·출처를 아래에서 확인하세요. 앱의 demo 모드는 패키지 조회 성공의 근거가 아닙니다.':source(r));
      if(r?.status==='loading'){waiting++;add(panel.body,'p',`${label} 대기 중`);continue;}
      if(r?.status!=='ok'){
        if(r?.status==='error'){failures++;problems.push(label+' 조회 실패');add(panel.body,'p',`${label} 조회 실패 · 결과 확인 불가. 다음: 로컬 앱 실행·계정 연결을 확인한 뒤 다시 조회하세요. 계속 실패하면 제공 도움정보를 확인하세요.`);}
        else add(panel.body,'p',`${label} 조회 전 · 다시 조회를 누르세요.`);
        continue;
      }
      add(panel.body,'p',`원천 확인 시각: ${stamp(r.checkedAt||r.data?.checkedAt)}${queried?' · 화면 수신 시각: '+stamp(new Date().toISOString()):''}`);
      try{
        if(panel.key==='identity'){
          const entries=index===0?[r.data.device,r.data.session]:r.data;
          if(!Array.isArray(entries)||entries.some(x=>!x||typeof x.id!=='string'||typeof x.status!=='string'))throw Error();
          if(!entries.length)add(panel.body,'p','조회된 항목 없음');
          const stateNames={compliant:'보안 기준 충족',noncompliant:'보안 기준 미충족',unknown:'확인 불가',active:'활성',expired:'만료',revoked:'철회됨'};
          if(index===0)summaries.push(`현재 기기: ${stateNames[entries[0].status]||'확인 불가'} · 세션: ${stateNames[entries[1].status]||'확인 불가'}`);
          else summaries.push(`${label} ${entries.length}개`);
          const list=add(panel.body,'ul','');for(const entry of entries)add(list,'li',`${entry.label||entry.id} · 상태: ${entry.status}`);
        }else if(panel.key==='events'){
          if(!Array.isArray(r.data)||r.data.some(e=>!e||typeof e.kind!=='string'||typeof e.summary!=='string'||!Number.isFinite(Date.parse(e.at))))throw Error();
          summaries.push(`조회된 기록 ${r.data.length}건`);
          const recent=[...r.data].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
          if(recent)summaries.push(`최근: ${recent.summary} · 발생 ${stamp(recent.at)}`);
          const labelNode=add(panel.body,'label','기록 종류 '),select=add(labelNode,'select','');select.setAttribute('aria-label','학생 핵심 보안 기록 종류');
          for(const kind of ['전체',...new Set(r.data.map(e=>e.kind))])add(select,'option',kind).value=kind;
          const list=add(panel.body,'ol','');list.setAttribute('aria-label','학생 핵심 보안 기록 타임라인');
          const render=()=>{list.replaceChildren();const rows=[...r.data].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).filter(e=>select.value==='전체'||e.kind===select.value);
            if(!rows.length)add(list,'li','조건에 맞는 기록 없음');
            for(const event of rows){const li=add(list,'li','');add(li,'p',`${stamp(event.at)} · ${event.kind}`);add(li,'p',event.summary);}
          };select.addEventListener('change',render);render();
          add(panel.body,'p','행의 시각은 사건 발생 시각이며 조회 시각과 다릅니다. 상세·근거는 보안 기록 메뉴의 기존 학생 타임라인에서 확인하세요.');
        }else{
          const data=r.data;if(!data||!['complete','partial','not_checked','not_configured','unverifiable'].includes(data.status)||!Array.isArray(data.packages))throw Error();
          const scanNames={complete:'조회 완료',partial:'일부 조회 실패',not_checked:'조회 대상 없음',not_configured:'설정 필요',unverifiable:'확인 불가'};
          summaries.push(`${scanNames[data.status]} · 패키지 ${data.packages.length}개`);
          add(panel.body,'p',`조회 범위 상태: ${data.status} · 패키지 ${data.packages.length}개`);
          const list=add(panel.body,'ul','');for(const pkg of data.packages){
            if(!pkg||typeof pkg.status!=='string')throw Error();
            add(list,'li',`${pkg.name||'이름 확인 불가'} · ${pkg.version||'버전 확인 불가'} · ${pkg.status} · 출처: ${pkg.source||'확인 불가'} · ${stamp(pkg.checkedAt)}`);
            if(pkg.status==='unverifiable'){failures++;problems.push((pkg.name||'패키지')+' 확인 불가');add(list,'li','이 패키지 조회 확인 불가 · 설치 버전과 공개 조회 승인 설정을 확인한 뒤 다시 조회하세요.');}
          }
          if(data.status!=='complete'){failures++;problems.push(scanNames[data.status]);add(panel.body,'p','전체 조회 미완료 · 다음: 프로젝트 설치 상태·lock 파일과 공개 조회 승인 설정을 확인하고 다시 조회하세요.');}
          add(panel.body,'p','미조회·실패는 취약점 없음이 아닙니다. 상세 근거는 기존 설치 패키지 학생 영역에서 확인하세요.');
        }
      }catch{failures++;problems.push(label+' 응답 형식 확인 불가');add(panel.body,'p',`${label} 응답 형식 확인 불가 · 다음: 앱 버전을 확인하고 다시 조회하세요. 예제 값으로 대체하지 않습니다.`);}
    }
    panel.status.textContent=waiting?'조회 대기 중':summaries.length?summaries.join(' · '):failures?'조회 확인 불가':'조회 전';
    if(failures&&summaries.length)panel.status.textContent+=' · 확인 불가 항목 있음';
    panel.provenance.textContent=panel.key==='vulnerabilities'?
      '출처: '+([...new Set(resources.flatMap(r=>r.status==='ok'&&Array.isArray(r.data?.packages)?r.data.packages.map(p=>p?.source).filter(v=>typeof v==='string'&&v):[]))].join(', ')||'확인 불가 · 조회 상태를 확인하세요.'):
      [...new Set(resources.map(r=>source(r)))].join(' / ');
    const times=resources.map((r,i)=>`${panel.labels[i]} ${stamp(r?.checkedAt||r?.data?.checkedAt)}`);
    panel.checked.textContent='원천 확인 시각: '+times.join(' / ')+(queried?' · 화면 수신: '+stamp(new Date().toISOString()):'');
    panel.advice.textContent=failures?problems.join(' · ')+(panel.key==='vulnerabilities'?' — 프로젝트 설치·lock 파일·공개 조회 승인 설정을 확인한 뒤 다시 조회하세요.':' — 로컬 앱 실행·계정 연결을 확인한 뒤 다시 조회하세요. 계속 실패하면 제공 도움정보를 확인하세요.'):
      panel.key==='identity'?'세션 활성은 PC가 안전하다는 판정이 아닙니다.':panel.key==='vulnerabilities'?'미조회·실패는 취약점 없음이 아닙니다.':'발생 시각순으로 표시합니다. 상세에서 종류를 선택할 수 있습니다.';

  }
  function sync(key,resources){
    const p=panels.get(key),signature=JSON.stringify(resources);
    if(signature===p.signature)return;
    p.signature=signature;p.generation++;p.busy=false;p.button.textContent=`${p.buttonLabel||p.title} 다시 조회`;p.button.removeAttribute('aria-disabled');p.section.setAttribute('aria-busy','false');display(p,resources);
  }
  const originalIdentity=legacy.renderIdentity,originalEvents=legacy.renderEvents,originalVulns=legacy.renderVulnerabilities;
  legacy.renderIdentity=function(input){
    sync('identity',[input.me,input.devices,input.sessions]);
    const container=document.createElement('div');container.appendChild(root);
    const details=add(container,'details','');add(details,'summary','기존 로그인·기기·세션 상세');details.appendChild(originalIdentity(input));queueMicrotask(showFirstGuide);return container;
  };
  legacy.renderEvents=function(input){sync('events',[input]);return originalEvents(input);};
  legacy.renderVulnerabilities=function(input){sync('vulnerabilities',[input]);return originalVulns(input);};
  return legacy;
}
