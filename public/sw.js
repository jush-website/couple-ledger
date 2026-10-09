// 讓「加到主畫面」的版本可以離線開啟。刻意寫得很保守：
// - 頁面（HTML）一律先走網路，拿不到才用快取 → 新版部署後馬上生效，不會卡舊版
// - /assets/* 檔名帶 hash、內容永不改變 → 快取優先
// - /api/*、Firebase、其他網域一律不碰，資料同步交給 Firestore 自己的離線快取
// 改了這支檔案的快取策略時，記得把 CACHE 的版本號加一，舊快取才會被清掉。
// v2：v1 可能把「找不到檔案時回傳的首頁 HTML」存成程式檔，換版本號讓舊快取整個清掉
const CACHE = 'couple-ledger-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        // 只存真正的程式／圖片；回來的是 HTML（檔案不存在時的首頁）就不要存，不然會一直壞下去
        const isHtml = (res.headers.get('content-type') || '').includes('text/html');
        if (res.ok && !isHtml) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
        return res;
      }))
    );
  }
});
