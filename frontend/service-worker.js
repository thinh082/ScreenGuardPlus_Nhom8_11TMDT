// An explicit, immutable app-shell allowlist. Never cache uploads, API responses or findings.
const CACHE = "screenguard-shell-v2";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/router.js",
  "./js/components/icons.js",
  "./js/components/ui.js",
  "./js/pages/dashboard.js",
  "./js/pages/scanner.js",
  "./js/pages/configuration.js",
  "./js/pages/settings.js",
  "./js/services/config-service.js",
  "./js/services/scanner-service.js",
  "./js/services/mock-scanner.js",
  "./manifest.webmanifest",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
const allowed = new Set(
  SHELL.map((path) => new URL(path, self.registration.scope).href),
);
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("screenguard-shell-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.search ||
    !allowed.has(url.href)
  )
    return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      // Only precached shell assets may be fetched here. No runtime cache writes.
      return fetch(event.request);
    }),
  );
});
