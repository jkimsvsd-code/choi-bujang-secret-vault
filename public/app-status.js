const install = document.querySelector('#install-app');
const status = document.querySelector('#install-status');
const connection = document.querySelector('#connection-status');
const standalone = window.matchMedia('(display-mode: standalone)');
let pendingInstall;
function renderInstall() {
  const appWindow = standalone.matches || navigator.standalone === true;
  status.textContent = appWindow ? '앱 창에서 사용 중입니다. 기기 승인 여부와는 별개입니다.' : '브라우저에서 사용 중입니다.';
  install.hidden = appWindow || !pendingInstall;
}
function renderConnection() {
  connection.textContent = navigator.onLine === false
    ? '오프라인 — 연결을 복구한 뒤 다시 시도해 주세요.'
    : '네트워크 연결 감지 — 서버 접속 및 기기 승인을 보장하지 않습니다.';
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  pendingInstall = event;
  renderInstall();
});
install.addEventListener('click', async () => {
  const prompt = pendingInstall;
  if (!prompt) return;
  pendingInstall = null;
  renderInstall();
  try { await prompt.prompt(); await prompt.userChoice; }
  catch { status.textContent = '설치 창을 열 수 없습니다. 브라우저 메뉴를 확인해 주세요.'; }
});
window.addEventListener('appinstalled', () => {
  pendingInstall = null;
  renderInstall();
  status.textContent = '앱 설치 완료. 기기 승인은 별도 확인이 필요합니다.';
});
standalone.addEventListener('change', renderInstall);
window.addEventListener('online', renderConnection);
window.addEventListener('offline', renderConnection);
renderInstall();
renderConnection();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    connection.textContent += ' 오프라인 시작 안내를 준비하지 못했습니다.';
  });
}
