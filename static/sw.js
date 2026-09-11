/* ============================================================
   Service Worker：让页面秒开（静态资源走缓存，接口永远走网络）
   ⚠️ 只在安全上下文里生效（http://localhost / http://*.localhost / https）。
   普通 IP 访问时浏览器会直接忽略注册，不影响使用。
   ============================================================ */
const CACHE = 'dsui-shell-v3';
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
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))   // 缺哪个不影响整体
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;        // 接口绝不缓存（要的是实时）

  // 静态资源：先用缓存（秒开），后台顺便更新
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
