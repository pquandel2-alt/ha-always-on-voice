/**
 * Service Worker for HA Voice Assist PWA
 * Cache-first strategy for shell files, network-first for API calls
 */

const CACHE_NAME = "ha-voice-v1";
const SHELL_URLS = [
  "/ha_voice_app/index.html",
  "/ha_voice_app/main.js",
  "/ha_voice_app/audio.js",
  "/ha_voice_app/ha-ws.js",
  "/ha_voice_app/style.css",
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
  // Skip API/WebSocket requests — let them go to network
  if (
    event.request.url.includes("/api/") ||
    event.request.url.includes("/auth/") ||
    event.request.url.includes("ws")
  ) {
    return;
  }

  // Cache-first for shell resources
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(event.request).then((response) => {
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
      });
    })
  );
});
