// An explicit, immutable app-shell allowlist. Never cache uploads, API responses or findings.
const CACHE = "screenguard-shell-v8";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/theme-init.js",
  "./js/services/theme-service.js",
  "./js/router.js",
  "./js/components/icons.js",
  "./js/components/ui.js",
  "./js/components/scanner-view.js",
  "./js/components/desktop-settings.js",
  "./js/services/desktop-service.js",
  "./js/pages/dashboard.js",
  "./js/pages/scanner.js",
  "./js/pages/configuration.js",
  "./js/pages/settings.js",
  "./js/pages/notifications.js",
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
    (async () => {
      const old = (await caches.keys()).filter(
        (key) => key.startsWith("screenguard-shell-") && key !== CACHE,
      );
      await Promise.all(old.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
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
    (async () => {
      // Serve current code whenever the local server is available. Cache is an
      // offline fallback, not a reason to pin an installed PWA to an old UI.
      let response;
      try {
        response = await fetch(event.request, { cache: "no-store" });
        if (response.ok) return response;
      } catch {}
      const cached = await (await caches.open(CACHE)).match(event.request);
      return cached || response || Response.error();
    })(),
  );
});
