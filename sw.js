const CACHE_NAME = "liver-atlas-v6";
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
// baked バイナリと three.min.js はキャッシュ優先。
// アプリ本体（HTML/JS/CSS）は手元の控えを即返し、裏で取り直して次回の起動に反映する（stale-while-revalidate）。
function putCache(req, res) {
  if (res && res.ok) { const cl = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, cl)); }
  return res;
}
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.registration.scope)) return;
  const u = new URL(e.request.url);
  if (u.pathname.endsWith(".bin") || u.pathname.endsWith("three.min.js")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => putCache(e.request, res))));
    return;
  }
  const isNav = e.request.mode === "navigate";
  const key = isNav ? new Request(new URL("./index.html", self.registration.scope)) : e.request;
  const net = fetch(e.request).then((res) => putCache(key, res));
  e.waitUntil(net.catch(() => {}));
  e.respondWith(
    caches.match(key, { ignoreSearch: true }).then((hit) => hit || net.catch(() => caches.match("./index.html")))
  );
});
