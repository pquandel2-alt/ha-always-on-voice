/**
 * Service Worker for the HA Voice Control PWA
 * Network-first shell caching so fixes are picked up immediately while the
 * last successful shell remains available as an offline fallback.
 */

const CACHE_NAME = "ha-voice-v143";
const SHELL_URLS = [
  "/ha_voice_app/index.html",
  "/ha_voice_app/ui.js",
  "/ha_voice_app/main.js",
  "/ha_voice_app/audio.js",
  "/ha_voice_app/ha-ws.js",
  "/ha_voice_app/style.css",
  "/ha_voice_app/js/three.min.js",
  "/ha_voice_app/js/avatar-particle-scene.js",
  "/ha_voice_app/avatar-target.json",
  "/ha_voice_app/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only ever touch same-origin GETs for the app shell. The previous
  // `includes("ws")` test matched any URL containing those two letters, which
  // pulled unrelated requests out of the cache path.
  if (event.request.method !== "GET") return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch (_error) {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    !url.pathname.startsWith("/ha_voice_app/")
  ) {
    return;
  }

  // Network-first prevents an installed PWA from pinning an old frontend.
  event.respondWith(
    fetch(event.request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => caches.match(event.request))
  );
});
