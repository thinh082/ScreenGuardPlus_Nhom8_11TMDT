import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ request }) => {
  const health = await (await request.get("/api/health")).json();
  test.skip(
    !health.ocr_available,
    "Real Tesseract unavailable; OCR browser integration was not run.",
  );
});

test("TC06 TC10 real screenshot → automatic + manual regions → opaque exported PNG", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#/scanner");
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/scan"),
  );
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/all.png");
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.mode).toBe("real_ocr");
  await expect(page.locator("#finding-count")).toHaveText("5");
  await expect(page.locator(".finding-info small").first()).toContainText(
    "Độ tin cậy",
  );
  await expect(page.locator("#findings-list")).toContainText(
    "te***@example.com",
  );
  await expect(page.locator("#findings-list")).not.toContainText(
    "test.screenguard@example.com",
  );
  await expect(page.locator("[data-finding]:checked")).toHaveCount(5);
  await page.locator("#advanced-tools>summary").click();
  await page.locator(".coordinates summary").click();
  for (const [key, value] of Object.entries({
    x: "50",
    y: "5",
    width: "50",
    height: "30",
  }))
    await page.locator(`#coordinate-form [name="${key}"]`).fill(value);
  await page.locator('#coordinate-form [type="submit"]').click();
  await expect(page.locator("#finding-count")).toHaveText("6");
  await page.locator("#image-menu>summary").click();
  await page.locator("#start-scan").click();
  await expect(page.locator("#scan-progress")).toBeHidden();
  await expect(page.locator("#finding-count")).toHaveText("6");
  const labelPixels = await page
    .locator("#preview-canvas")
    .evaluate((canvas) => [
      ...canvas.getContext("2d").getImageData(50, 50, 300, 40).data,
    ]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/real-ocr-before.png",
    fullPage: true,
  });
  await page.locator("#redact-selected").click();
  const downloaded = page.waitForEvent("download");
  await page.locator("#download-image").click();
  const bytes = await readFile(await (await downloaded).path());
  const exported = await page.evaluate(
    async ({ base64, boxes }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return {
        labels: [...ctx.getImageData(50, 50, 300, 40).data],
        manual: [...ctx.getImageData(60, 10, 1, 1).data],
        regions: boxes.map(([x, y, right, bottom]) => [
          ...ctx.getImageData(
            Math.floor((x + right) / 2),
            Math.floor((y + bottom) / 2),
            1,
            1,
          ).data,
        ]),
      };
    },
    {
      base64: bytes.toString("base64"),
      boxes: result.findings.map((f) => f.bbox),
    },
  );
  expect(exported.labels).toEqual(labelPixels);
  expect(exported.manual).toEqual([17, 24, 39, 255]);
  expect(exported.regions).toEqual(Array(5).fill([17, 24, 39, 255]));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/real-ocr-scanner.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("TC08 TC09 toggles and custom Keyword/Regex affect real imported images", async ({
  page,
}) => {
  await page.goto("/#/configuration");
  await page.locator('[data-type="email"]').uncheck();
  for (const rule of [
    { name: "Staff code", kind: "regex", pattern: "NV-[0-9]{6}" },
    { name: "Secret", kind: "keyword", pattern: "CONFIDENTIAL" },
  ]) {
    await page.locator("#add-rule").click();
    await page.locator('#rule-form [name="name"]').fill(rule.name);
    await page.locator('#rule-form [name="kind"]').selectOption(rule.kind);
    await page.locator('#rule-form [name="pattern"]').fill(rule.pattern);
    await page.locator('#rule-form [type="submit"]').click();
    await expect(
      page.locator(".rule-info strong").filter({ hasText: rule.name }),
    ).toBeVisible();
  }
  await page.locator('[data-nav="/scanner"]').click();
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/all.png");
  await expect(page.locator("#finding-count")).toHaveText("4");
  await expect(page.locator("#findings-list")).not.toContainText(
    "Địa chỉ email",
  );
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/custom.png");
  await expect(page.locator("#finding-count")).toHaveText("2");
  await expect(page.locator("#findings-list")).toContainText("Staff code");
  await expect(page.locator("#findings-list")).toContainText("Secret");
});

test("TC13 OCR unavailable leaves manual marking/redaction available", async ({
  page,
}) => {
  await page.route("**/api/scan", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          code: "OCR_UNAVAILABLE",
          message: "Tesseract chưa sẵn sàng; hãy đánh dấu thủ công.",
        },
      }),
    }),
  );
  await page.goto("/#/scanner");
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/email.png");
  await expect(page.locator("#scanner-error")).toContainText(
    "Bộ kiểm tra ảnh chưa sẵn sàng",
  );
  await expect(page.locator("#finding-count")).toHaveText("0");
  await expect(page.locator("#toggle-draw")).toBeEnabled();
  await page.locator("#advanced-tools>summary").click();
  await page.locator(".coordinates summary").click();
  for (const [key, value] of Object.entries({
    x: "440",
    y: "45",
    width: "550",
    height: "45",
  }))
    await page.locator(`#coordinate-form [name="${key}"]`).fill(value);
  await page.locator('#coordinate-form [type="submit"]').click();
  await page.locator("#redact-selected").click();
  await expect(page.locator("#download-image")).toBeEnabled();
});
