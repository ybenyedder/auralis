/* ============================================================================
   Auralis service worker — app-shell caching.
   ----------------------------------------------------------------------------
   Goals (kept deliberately small and safe):
   • Make the app installable (PWA + Play Store TWA quality bar).
   • Boot the shell instantly / offline instead of the browser's dinosaur.
   • NEVER touch /api/* — streams use Range requests and every payload carries
     auth tokens; caching either would break playback and leak sessions.
   Strategy: navigations are network-first (a fresh deploy is picked up on the
   next open, no stale-app support tickets) with the cached shell as offline
   fallback; immutable static assets (/_next/static, icons, manifest) are
   cache-first.
   ========================================================================== */

const CACHE = "auralis-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/logo.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // allSettled: a single unreachable asset must not block installation.
      await Promise.allSettled(
        SHELL_ASSETS.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API calls (auth, library JSON, Range-based audio streams, artwork with
  // session tokens) always go to the network — no cache, no fallback.
  if (url.pathname.startsWith("/api/")) return;
  // Range requests (seeking in an audio element) are handled by the network
  // stack alone; a Response built here could never satisfy them correctly.
  if (request.headers.has("range")) return;

  // Document navigations: network-first, cached shell as offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE);
          const cached =
            (await cache.match(request, { ignoreSearch: true })) ?? (await cache.match("/"));
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Immutable static assets: cache-first.
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/screenshots/") ||
    url.pathname === "/logo.svg" ||
    url.pathname === "/manifest.webmanifest";
  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok && fresh.type === "basic") {
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          return Response.error();
        }
      })(),
    );
  }
});
