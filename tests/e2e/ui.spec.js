import { test, expect } from "@playwright/test";
test.use({ reducedMotion: "reduce" });

async function inViewport(locator, page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}
test("PWA opens scanner first; desktop fits the first screen in both saved themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Kiểm tra ảnh");
  await inViewport(page.locator("#choose-image"), page);
  await inViewport(page.locator("#open-camera"), page);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(769);
  for (const theme of ["light", "dark"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.screenshot({
      path: `test-results/ui-desktop-${theme}.png`,
      fullPage: true,
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.locator('[data-nav="/configuration"]').click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.screenshot({
      path: `test-results/ui-configuration-${theme}.png`,
      fullPage: true,
    });
    await expect(page.locator("#rule-dialog")).not.toBeVisible();
    await page.locator("#add-rule").click();
    await expect(page.locator("#rule-dialog")).toBeVisible();
    await page.locator("#cancel-rule").click();
    if (theme === "light") {
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      await page.route("**/api/config/validate", async (route) => {
        await gate;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"valid":true}',
        });
      });
      await page.locator("#add-rule").click();
      await page.locator('#rule-form [name="name"]').fill("Quy tắc đã hủy");
      await page.locator('#rule-form [name="pattern"]').fill("PRIVATE");
      const requested = page.waitForRequest("**/api/config/validate");
      await page.locator('#rule-form [type="submit"]').click();
      await requested;
      await page.locator("#cancel-rule").click();
      const responded = page.waitForResponse("**/api/config/validate");
      release();
      await responded;
      await expect(page.locator(".rule-row")).toHaveCount(0);
      await page.unroute("**/api/config/validate");
    }
    for (const [path, name] of [
      ["/settings", "settings"],
      ["/overview", "overview"],
    ]) {
      await page.locator(`[data-nav="${path}"]`).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
      ).toBeLessThanOrEqual(769);
      await page.screenshot({
        path: `test-results/ui-${name}-${theme}.png`,
        fullPage: true,
      });
    }
    await page.locator('[data-nav="/scanner"]').click();
  }
});

test("small phone and tablet keep primary actions visible", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 667 },
    { width: 834, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await inViewport(page.locator("#choose-image"), page);
    await inViewport(page.locator("#open-camera"), page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/ui-width-${viewport.width}.png`,
      fullPage: true,
    });
  }
});

test("phone keeps import, result tabs and export actions in view without page scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  for (const control of [
    "#choose-image",
    "#open-camera",
    "#demo-image",
    "#theme-toggle",
  ])
    await inViewport(page.locator(control), page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/ui-mobile-light.png",
    fullPage: true,
  });
  await page.locator("#demo-image").click();
  await expect(page.locator("#mobile-finding-count")).toHaveText("5");
  await expect(page.locator("#scan-progress")).toBeHidden();
  await inViewport(page.locator("#redact-selected"), page);
  await inViewport(page.locator("#advanced-tools>summary"), page);
  await expect(page.locator("#toggle-draw")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/ui-mobile-preview.png",
    fullPage: true,
  });
  await page.locator("#mobile-findings-tab").click();
  await expect(page.locator("#findings-list")).toBeVisible();
  await page.screenshot({
    path: "test-results/ui-mobile-findings.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(845);
  await inViewport(page.locator("#redact-selected"), page);
  await page.locator("#deselect-all").click();
  await expect(page.locator("#redact-selected")).toBeDisabled();
  await page.locator("#select-all").click();
  await page.locator("#redact-selected").click();
  await expect(page.locator("#download-image")).toBeEnabled();
  await page.locator("#mobile-image-tab").click();
  await expect(page.locator("#view-after")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#theme-toggle").click();
  await page.screenshot({
    path: "test-results/ui-mobile-dark.png",
    fullPage: true,
  });
  await page.locator('[data-mobile-nav="/settings"]').click();
  await expect(page.locator("h1")).toHaveText("Cài đặt");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
