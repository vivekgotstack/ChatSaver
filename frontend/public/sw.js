const CACHE_NAME = "chatsaver-shell-v9";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/cs-transparent.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/icon.svg",
  "/art/crimson-canvas.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("chatsaver-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
      // Start fetching HTML while the worker itself is still starting up.
      self.registration.navigationPreload?.enable().catch(() => undefined),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    const response = Promise.resolve(event.preloadResponse)
      .catch(() => undefined)
      .then((preloaded) => preloaded ?? fetch(event.request));
    // Return the network stream immediately. Cache writes must not delay the
    // first paint or turn a successful page load into an offline fallback.
    event.waitUntil(response.then(async (fresh) => {
      if (!fresh.ok) return;
      const copy = fresh.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, copy);
    }).catch(() => undefined));
    event.respondWith(
      response.catch(async () =>
        (await caches.match(event.request)) ?? (await caches.match("/")) ?? Response.error(),
      ),
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
