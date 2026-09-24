// Minimal offline-first service worker for the TaskMan PWA.
const CACHE = "taskman-v1";
const CORE = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only ever handle same-origin GETs. Cross-origin requests (Supabase edge
  // function, Google APIs) must pass straight through to the network — the SW
  // must not intercept them or it breaks CORS preflight and API responses.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Never cache dev/source modules — Vite serves them fresh with HMR query
  // strings, and caching them serves stale code ("module does not provide an
  // export" errors after edits). Only cache the static app shell.
  const isModule =
    url.search ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/@");
  if (isModule) return;

  // Network-first so fresh deploys win; fall back to cache only when offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
