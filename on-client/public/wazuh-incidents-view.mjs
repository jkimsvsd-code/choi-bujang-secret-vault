const labels = {
  pending:'검토 대기', simulated:'모의 차단 완료', rejected:'반려', expired:'만료',
  incident_created:'사건 생성', alert_received:'경보 접수', candidate_created:'차단 후보 생성',
  candidate_expired:'후보 만료', approved:'승인', simulation_succeeded:'모의 대응 완료'
};
const time = ms => new Date(ms).toLocaleString('ko-KR');

async function request(path, action) {
  const response = await fetch('/api/wazuh' + path, action ? {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action})
  } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || data.error || 'Wazuh 요청에 실패했습니다.');
  return data.data;
}

function append(parent, tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
}

export function createWazuhIncidentsView() {
  const list = document.getElementById('wazuh-incidents');
  const detail = document.getElementById('wazuh-detail');
  const status = document.getElementById('wazuh-status');
  const refreshButton = document.getElementById('wazuh-refresh');
  let selected;
  let busy = false;

  async function run(work) {
    if (busy) return;
    busy = true;
    refreshButton.disabled = true;
    status.textContent = '처리 중…';
    try {
      status.textContent = await work() || '';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      refreshButton.disabled = false;
      busy = false;
    }
  }

  function button(parent, label, work) {
    const control = append(parent, 'button', label);
    control.type = 'button';
    control.className = 'btn';
    control.addEventListener('click', () => run(work));
    return control;
  }

  async function loadDetail() {
    detail.replaceChildren();
    const row = await request('/incidents/' + selected);
    append(detail, 'h3', row.ip + ' 로그인 실패');
    append(detail, 'p', '경보 ' + row.hits + '건 · 최초 ' + time(row.opened));
    append(detail, 'h4', '차단 후보');
    const candidate = row.candidate;
    if (candidate) {
      append(detail, 'p', labels[candidate.status] + ' · ' + candidate.reason);
      append(detail, 'p', '검토 만료 ' + time(candidate.expires));
      if (candidate.status === 'simulated') append(detail, 'p', row.ip + ' 차단 모의 실행 성공');
      if (candidate.status === 'pending') {
        for (const [action, label] of [['approve','승인 및 모의 차단'], ['reject','반려']]) {
          button(detail, label, async () => {
            try {
              await request('/candidates/' + candidate.id + '/review', action);
            } finally {
              await loadDetail();
            }
            return action === 'approve' ? '모의 차단을 완료했습니다.' : '차단 후보를 반려했습니다.';
          });
        }
      }
    } else {
      append(detail, 'p', '검토할 차단 후보가 없습니다.');
    }
    append(detail, 'h4', '감사 이력');
    const history = append(detail, 'ol', '');
    for (const entry of row.audit) {
      append(history, 'li', time(entry.at) + ' · ' + (labels[entry.action] ?? entry.action) + ' · ' + entry.detail);
    }
  }

  async function load() {
    list.replaceChildren();
    detail.replaceChildren();
    const rows = await request('/incidents');
    if (!rows.some(row => row.id === selected)) selected = rows[0]?.id;
    if (!selected) return '접수된 Wazuh 사건이 없습니다.';
    for (const row of rows) {
      const item = append(list, 'li', '');
      const control = button(item, row.ip + ' · 경보 ' + row.hits + '건', async () => {
        selected = row.id;
        for (const choice of list.querySelectorAll('button')) {
          choice.setAttribute('aria-pressed', String(choice === control));
        }
        await loadDetail();
      });
      control.setAttribute('aria-pressed', String(row.id === selected));
    }
    await loadDetail();
  }

  const refresh = () => run(load);
  refreshButton.addEventListener('click', refresh);
  return { refresh };
}
