// Offline cache for Network Keeper: the app shell is cached, the network wins when it answers.
const C = "network-keeper-v8";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "linkedin.js", "aggregate.js", "discovery.js", "capture.js", "capture-ui.js"];
self.addEventListener("install", e => e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("network-keeper-") && k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).then(r => { if(r.ok && new URL(e.request.url).origin === self.location.origin) { const k = r.clone(); e.waitUntil(caches.open(C).then(c => c.put(e.request, k))); } return r; }).catch(() => caches.match(e.request)));
});
