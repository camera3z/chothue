/* Rentbook release: __RENTBOOK_RELEASE__ */
// Deliberately network-only: no customer, session, photo or license is cached.
// Offline navigation gets a static explanation, never a demo or stale records.
const offlinePage = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b6b70"><title>Kết nối lại · Rentbook</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f2f5f6;color:#12232b;font:15px/1.8 system-ui,sans-serif;padding:24px}main{max-width:460px;padding:36px;background:#fff;border:1px solid #d8e1e4;border-radius:16px}.brand{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:700}.brand i{display:grid;place-items:center;width:28px;height:28px;background:#0b6b70;color:#fff;border-radius:7px;font-style:normal}h1{font-size:26px;line-height:1.4;margin:30px 0 16px}p{color:#587078}a{display:inline-block;margin-top:12px;padding:10px 18px;border-radius:8px;background:#0b6b70;color:white;font-weight:600;text-decoration:none}a:focus-visible{outline:3px solid #0b6b70;outline-offset:4px}@media(prefers-color-scheme:dark){body{background:#0e1a1f;color:#e5eef0}main{background:#15252b;border-color:#26393f}p{color:#8da4ab}}
</style></head><body><main><div class="brand"><i>○</i>Rentbook</div><h1>Rentbook cần kết nối mạng.</h1><p>Kết nối lại Internet để tải không gian quản lý và tiếp tục công việc của bạn.</p><a href="">Thử kết nối lại</a></main></body></html>`;

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type === 'RENTBOOK_APPLY_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin || !['/', '/index.html'].includes(url.pathname)) return;
  event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => new Response(offlinePage, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  })));
});
