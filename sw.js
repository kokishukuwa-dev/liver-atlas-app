const CACHE_NAME = "liver-atlas-v5";
const CORE_FILES = [
  "./", "./index.html", "./manifest.json",
  "./js/three.min.js", "./js/data.js", "./js/sdf.js", "./js/baked.js", "./js/levels.js", "./js/main.js",
  "./baked/l1_mouse_normal.bin",
  "./baked/l1_variants.bin",
  "./baked/shared.bin",
  "./baked/l2.bin",
  "./baked/l3.bin",
  "./baked/l4.bin",
  "./baked/l5.bin",
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
// baked バイナリと three.min.js はキャッシュ優先で高速返却し、アプリ本体はネット優先。
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.registration.scope)) return;
  const u = new URL(e.request.url);
  if (u.pathname.endsWith(".bin") || u.pathname.endsWith("three.min.js")) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res && res.ok) { const cl = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(e.request, cl)); }
        return res;
      }))
    );
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) { const cl = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(e.request, cl)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});
