const CACHE = 'dcg-v58';
const NETWORK_TIMEOUT = 3000;
const ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// アプリコード（HTML/JS/CSS/JSON）は network-first。
// 一度キャッシュしたJSを配信し続けると、バージョン更新後も古い壊れたコードが
// 残り続けるため、コードは常にネットワーク優先で取得し、キャッシュは
// オフライン時のフォールバックとしてのみ使う。
// 画像などの静的アセットのみ cache-first（更新頻度が低く鮮度が重要でない）。
function isAppCode(pathname) {
  return pathname.endsWith('.html') ||
         pathname.endsWith('/') ||
         pathname.endsWith('.js') ||
         pathname.endsWith('.css') ||
         pathname.endsWith('.json');
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 別オリジン（CDN等）はそのまま通す
  if (url.origin !== self.location.origin) return;

  if (isAppCode(url.pathname)) {
    // network-first: 常に最新コードを取得。成功時はキャッシュ更新、
    // 失敗（オフライン等）時のみキャッシュへフォールバック。
    e.respondWith(
      Promise.race([
        fetch(e.request).then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
            return res;
          }
          return caches.match(e.request).then(cached => cached || res);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT))
      ]).catch(() => caches.match(e.request))
    );
  } else {
    // 静的アセット（画像等）は cache-first、ミス時はネットワーク取得しキャッシュへ
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
  }
});
