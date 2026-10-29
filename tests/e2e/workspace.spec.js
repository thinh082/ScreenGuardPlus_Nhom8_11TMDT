import { test, expect } from "@playwright/test";

test("sample uses real OCR; export requires review and editing invalidates the previous image", async ({
  page,
}) => {
  const downloads = [];
  page.on("download", (item) => downloads.push(item));
  await page.goto("/");
  const pending = page.waitForResponse("**/api/scan");
  await page.locator("#demo-image").click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.mode).toBe("real_ocr");
  expect(new Set(result.findings.map((f) => f.type))).toEqual(
    new Set(["EMAIL", "PHONE", "CITIZEN_ID", "STUDENT_ID", "BANK_ACCOUNT"]),
  );
  await expect(page.locator("#finding-title")).toHaveText("Phát hiện 5 vùng");
  await expect(page.locator("#scan-mode")).toBeHidden();
  await expect(page.locator("#redact-selected")).toHaveText("Che 5 vùng");
  await expect(page.locator("#download-image")).toBeHidden();
  const first = result.findings[0];
  const row = page.locator(`[data-row="${first.id}"]`);
  await expect(row.locator("dl")).toBeHidden();
  await expect(row.locator(".finding-info")).not.toContainText("%");
  await row.locator("summary").click();
  await expect(row.locator("dl")).toContainText(
    `${Math.round(first.ocr_confidence * 100)}%`,
  );
  await expect(row.locator("dl")).toContainText(String(first.score));
  await page.locator("#redact-selected").click();
  await expect(page.locator("#redact-selected")).toBeHidden();
  await expect(page.locator("#download-image")).toBeVisible();
  await expect(page.locator("#edit-redaction")).toBeVisible();
  expect(downloads).toHaveLength(0);
  await page.locator("#edit-redaction").click();
  await expect(page.locator("#view-before")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#redact-selected")).toBeFocused();
  await expect(page.locator("#download-image")).toBeDisabled();
  await page.locator("#redact-selected").click();
  await page.locator("[data-finding]").first().uncheck();
  await expect(page.locator("#redact-selected")).toHaveText("Che 4 vùng");
  await expect(page.locator("#download-image")).toBeHidden();
  await expect(page.locator("#view-after")).toBeDisabled();
  await page.evaluate(() => document.querySelector("#download-image").click());
  expect(downloads).toHaveLength(0);
});

test("original-size inspector keeps image coordinates, supports selection and Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  const pending = page.waitForResponse("**/api/scan");
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/all.png");
  const result = await (await pending).json();
  await expect(page.locator("#finding-count")).toHaveText("5");
  await page.locator("#zoom-image").click();
  await expect(page.locator("#image-detail-dialog")).toBeVisible();
  const geometry = await page.locator("#detail-canvas").evaluate((c) => ({
    width: c.width,
    height: c.height,
    displayWidth: c.getBoundingClientRect().width,
  }));
  expect(geometry).toEqual({
    width: result.width,
    height: result.height,
    displayWidth: result.width,
  });
  const finding = result.findings[0];
  const [x, y, right, bottom] = finding.bbox;
  await page
    .locator("#detail-canvas")
    .click({ position: { x: (x + right) / 2, y: (y + bottom) / 2 } });
  await expect(
    page.locator(`[data-finding="${finding.id}"]`),
  ).not.toBeChecked();
  await expect(page.locator("#preview-canvas")).toHaveAttribute(
    "data-active-finding",
    finding.id,
  );
  await page.screenshot({ path: "test-results/phase3-image-detail.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("#image-detail-dialog")).toBeHidden();
  await expect(page.locator("#zoom-image")).toBeFocused();
});

test("laptop and desktop workspaces fit both themes, with three primary navigation items", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".sidebar nav a")).toHaveCount(3);
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/all.png");
  await expect(page.locator("#finding-count")).toHaveText("5");
  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
    for (const theme of ["light", "dark"]) {
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page.locator("#theme-toggle").click();
      expect(
        await page.evaluate(() => ({
          horizontal: document.documentElement.scrollWidth > innerWidth,
          vertical: document.documentElement.scrollHeight > innerHeight + 1,
        })),
      ).toEqual({ horizontal: false, vertical: false });
      for (const selector of [
        "#preview-canvas",
        "#redact-selected",
        "#zoom-image",
        ".findings-warning",
      ]) {
        const box = await page.locator(selector).boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(
          page.viewportSize().height + 1,
        );
      }
      const left = await page.locator(".scanner-workspace").boundingBox();
      const right = await page.locator(".findings-panel").boundingBox();
      expect(left.width / (left.width + right.width)).toBeGreaterThanOrEqual(
        0.64,
      );
      await page.screenshot({
        path: `test-results/phase3-workspace-${width}-${theme}.png`,
        fullPage: true,
      });
    }
  }
  await page.locator("#redact-selected").click();
  await page.screenshot({
    path: "test-results/phase3-after-dark.png",
    fullPage: true,
  });
  await page.locator('[data-nav="/configuration"]').click();
  await expect(page.locator(".protection-row")).toHaveCount(5);
  await expect(page.locator(".counter")).toHaveText("0 quy tắc");
  await expect(page.locator(".config-card")).toHaveCount(0);
});

test("low OCR confidence is flagged without changing OCR data, and loading stays compact", async ({
  page,
}) => {
  // Presentation-only fixture; real OCR accuracy is covered by the other tests.
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route("**/api/scan", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.findings[0].ocr_confidence = 0.03;
    result.findings[0].score = 0.4321;
    await gate;
    await route.fulfill({ response, json: result });
  });
  await page.goto("/");
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/email.png");
  await expect(page.locator("#scan-progress")).toBeVisible();
  await expect
    .poll(() => page.locator("#scan-progress").innerText())
    .toBe("Đang kiểm tra ảnh...");
  await expect(page.locator("#progress-bar")).not.toBeVisible();
  await page.screenshot({ path: "test-results/phase3-loading.png" });
  release();
  await expect(page.locator("#finding-count")).toHaveText("1");
  await expect(page.locator(".review-flag")).toHaveText("Cần kiểm tra");
  await expect(page.locator(".finding-details dl")).toBeHidden();
  await page.locator(".finding-details summary").click();
  await expect(page.locator(".finding-details dl")).toContainText("3%");
  await expect(page.locator(".finding-details dl")).toContainText("0.4321");
});
