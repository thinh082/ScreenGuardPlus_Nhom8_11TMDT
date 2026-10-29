import { test, expect } from "@playwright/test";

const legacyWorker = `
self.addEventListener('install',event=>event.waitUntil(caches.open('screenguard-shell-v5').then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(new URL(event.request.url).pathname==='/js/pages/settings.js')
  event.respondWith(new Response('export function settingsPage(main){main.innerHTML="<h1>Cài đặt cũ</h1>"}',{headers:{'Content-Type':'application/javascript; charset=utf-8'}}));
});`;

async function legacyInstall(page, context) {
  await context.route("**/service-worker.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: legacyWorker,
    }),
  );
  await page.goto("/#/settings");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Cài đặt cũ");
}

test("upgrade replaces a cached old Settings page on reload without clearing site data", async ({
  page,
  context,
}) => {
  await legacyInstall(page, context);
  await context.unroute("**/service-worker.js");
  await page.evaluate(async () => {
    const changed = new Promise((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", resolve, {
        once: true,
      }),
    );
    await (await navigator.serviceWorker.getRegistration()).update();
    await changed;
  });
  await page.reload();
  await expect(page.locator(".desktop-settings h2")).toHaveText(
    "Tự nhận diện screenshot — Windows",
  );
  await expect(page.locator("#agent-state")).toHaveText("Stopped");
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toEqual(["screenguard-shell-v8"]);
  await page.screenshot({
    path: "test-results/pwa-settings-updated.png",
    fullPage: true,
  });
});

test("service worker update keeps an image being reviewed in Scanner", async ({
  page,
  context,
}) => {
  await legacyInstall(page, context);
  await page.goto("/#/scanner?demo");
  await expect(page.locator("#finding-count")).toHaveText("5");
  await page.evaluate(() => (window.reviewUpdateMarker = "keep"));
  await context.unroute("**/service-worker.js");
  await page.evaluate(async () => {
    const changed = new Promise((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", resolve, {
        once: true,
      }),
    );
    await (await navigator.serviceWorker.getRegistration()).update();
    await changed;
  });
  expect(await page.evaluate(() => window.reviewUpdateMarker)).toBe("keep");
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.locator("#finding-count")).toHaveText("5");
});
