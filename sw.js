const CACHE_NAME = "liver-atlas-v2";
const CORE_FILES = [
  "./", "./index.html", "./manifest.json",
  "./js/three.min.js", "./js/data.js", "./js/sdf.js", "./js/levels.js", "./js/main.js",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE_FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});
// 直した版がすぐ届くようネット優先。圏外のときだけキャッシュを使う。
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.registration.scope)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) { const cl = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(e.request, cl)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});
