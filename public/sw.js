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

// The daily reminder push carries no payload (see supabase/functions/server/vapid.ts
// for why — briefly, encrypting a payload hits a still-open Deno bug, so the server
// sends an empty push and this fixed notification stands in for the real content).
// event.data is always null here; there's nothing to read from it.
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("TaskMan", {
      body: "Your video of the day is ready — open TaskMan to watch it.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "daily-video",
      renotify: true,
      data: { url: "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
