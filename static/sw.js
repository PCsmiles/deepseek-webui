/* ============================================================
   Service Worker
   ⚠️ 策略必须是「网络优先」：本地服务本来就快，而缓存优先会让用户
      一直看到旧代码 —— 踩过：改了 app.js 用户刷新也拿不到新版本。
   网络不通时才用缓存（断网也能打开页面）。
   ⚠️ 只在安全上下文里生效（localhost / *.localhost / https）。
   ============================================================ */
const V = 'v4';
const CACHE = 'dsui-shell-' + V;
const SHELL = [
  '/',
  '/static/style.css',
  '/static/app.js',
  '/static/manifest.webmanifest',
  '/static/icon-192.png',
  '/static/icon-512.png',
  '/static/vendor/marked.min.js',
  '/static/vendor/highlight.min.js',
  '/static/vendor/github-dark.min.css',
  '/static/vendor/github.min.css',
  '/static/vendor/katex.min.js',
  '/static/vendor/katex.min.css',
  '/static/vendor/inter-var.woff2',
  '/static/vendor/jetbrains-mono-var.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter((k) => k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    // 从旧版本升级上来时，把已经打开的页面强制刷新一次，
    // 让新代码立刻生效（否则用户得手动关标签页重开）
    if (old.length) {
      const cls = await self.clients.matchAll({ type: 'window' });
      for (const c of cls) {
        try { c.navigate(c.url); } catch (err) { /* 忽略 */ }
      }
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;      // 接口绝不缓存

  e.respondWith((async () => {
    try {
      const res = await fetch(req);                  // 网络优先：永远拿到最新代码
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req);           // 断网了才用缓存
      if (hit) return hit;
      throw err;
    }
  })());
});
