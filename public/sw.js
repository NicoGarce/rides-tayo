/* Rides Tayo — service worker
   Strategies:
   - navigations: network-first, offline fallback to cached shell
   - immutable build assets (/ _next/static, icons): cache-first
   - other same-origin GETs: network-first with cache fallback
   - everything else (Firebase, APIs, WebSocket, cross-origin, non-GET):
     untouched, handled by the browser/network directly */

const CACHE = "rides-tayo-v3";
const SHELL = ["/"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/* requests the SW must not intercept */
function shouldPassThrough(url) {
  return (
    url.origin !== self.location.origin ||
    !/^https?:$/.test(url.protocol) ||
    /firebaseio\.com|firebaseinstallations\.service|googleapis\.com|gstatic\.com|youtube\.com|ytimg\.com|peerjs\.com/.test(
      url.hostname
    ) ||
    url.pathname.includes("hmr")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (shouldPassThrough(url)) return;

  /* page navigations */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  /* immutable hashed build assets + icons */
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  /* other same-origin assets */
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
