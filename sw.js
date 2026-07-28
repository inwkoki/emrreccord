// ED QuickCapture service worker — offline support.
// Bump CACHE when the shell changes so old caches are cleaned up.
const CACHE = "edqc-v3";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./reference-data.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Dynamic Firebase auth / realtime-database traffic must never be cached.
const DYNAMIC = /firebasedatabase\.app|firebaseio\.com|identitytoolkit|googleapis\.com|google-analytics|firebaseinstallations/;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // never intercept writes
  const url = new URL(req.url);
  if (DYNAMIC.test(url.host + url.pathname)) return; // pass through, no cache

  // Firebase SDK modules from gstatic are versioned & immutable → cache-first.
  if (url.host.endsWith("gstatic.com")) {
    e.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        })
      )
    );
    return;
  }

  // App shell (same origin) → network-first so online users always get the
  // latest build; fall back to cache (and index.html for navigations) offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() =>
          caches.match(req).then((cached) =>
            cached || (req.mode === "navigation" ? caches.match("./index.html") : undefined)
          )
        )
    );
  }
});
