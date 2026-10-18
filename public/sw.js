// Only app entry navigation gets a static fallback. No API interception or caching.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate'
      || url.origin !== self.location.origin || !['/', '/index.html'].includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>최 부장 자료실 · 연결 안내</title><body style="background:#101a28;color:#ecf4ff;font-family:system-ui;padding:32px;line-height:1.7"><h1>최 부장 자료실</h1><h2>지금은 연결할 수 없습니다</h2><p>오프라인이거나 서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 열어 주세요.</p><p>자료 조회·저장은 온라인에서만 가능합니다. 저장 요청은 자동 재전송되지 않습니다.</p><p>기기 승인: 확인 불가. 앱 설치만으로 기기 확인이 완료되지 않습니다.</p><a href="/" style="color:#8ad8df">다시 연결</a></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )));
});
