// sw.js
const CACHE_NAME = "wordjam-v1";
const ASSETS = [
  "./",                // index.html
  "./index.html",      // ファイル名固定なら
  "./manifest.webmanifest",
  "./styles.css",      // 分離してる場合
  "./app.js",          // 分離してる場合
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png"
];

// install：主要アセットを事前キャッシュ
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

// activate：古いキャッシュを掃除
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// fetch：
// 1) JSON/CSV等の学習データは「ネット優先→失敗時キャッシュ」
// 2) それ以外（HTML/CSS/JS/画像）は「キャッシュ優先→なければネット」
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  const isData = /\.(json|csv)$/i.test(url.pathname);

  if (isData) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
  } else {
    e.respondWith(
      caches.match(req).then(cached => {
        return (
          cached ||
          fetch(req).then(res => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
            return res;
          })
        );
      })
    );
  }
});