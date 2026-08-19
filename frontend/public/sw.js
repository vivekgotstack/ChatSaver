const CACHE_NAME = "chatsaver-shell-v6";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/cs-transparent.png",
  "/icon.svg",
  "/art/crimson-canvas.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          }
          return response;
        } catch {
          return (await caches.match(event.request)) ?? caches.match("/");
        }
      })(),
    );
    return;
  }

  // Next.js chunks are content-hashed and already cached safely by the browser.
  // Keeping them out of the service-worker cache prevents stale deployments
  // from leaving an already-installed PWA stuck on its server-rendered shell.
  if (url.pathname.startsWith("/_next/")) return;
  if (!["font", "image"].includes(event.request.destination)) return;

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});
