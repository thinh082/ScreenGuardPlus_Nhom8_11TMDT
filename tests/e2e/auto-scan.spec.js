import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("rapid replacement ignores an old real OCR response and never duplicates an import", async ({
  page,
}) => {
  const scans = [],
    downloads = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/scan")) scans.push(request);
  });
  page.on("download", (download) => downloads.push(download));
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    let first = true;
    window.fetch = async (url, options) => {
      if (String(url).endsWith("/api/scan") && first) {
        first = false;
        // Let the old real request finish despite AbortSignal, then deliver it late.
        const response = await nativeFetch(url, {
          ...options,
          signal: undefined,
        });
        await new Promise((resolve) => {
          window.releaseOldScan = resolve;
          window.oldScanReady = true;
        });
        return response;
      }
      return nativeFetch(url, options);
    };
  });
  await page.goto("/#/scanner");
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/email.png");
  await page.waitForFunction(() => window.oldScanReady);
  await expect(page.locator("#scan-progress")).toBeVisible();
  await expect(page.locator("#progress-bar")).not.toHaveAttribute(
    "value",
    /\d/,
  );
  await expect(page.locator("#progress-number")).not.toContainText("%");
  await page.locator("#image-menu>summary").click();
  await expect(page.locator("#start-scan")).toBeDisabled();
  await page.evaluate(() => document.querySelector("#start-scan").click());
  expect(scans).toHaveLength(1);
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/phone.png");
  await expect(page.locator(".finding-info strong")).toHaveText(
    "Số điện thoại",
  );
  await expect(page.locator("#scan-progress")).toBeHidden();
  await page.evaluate(async () => {
    window.releaseOldScan();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await expect(page.locator(".finding-info strong")).toHaveText(
    "Số điện thoại",
  );
  expect(scans).toHaveLength(2);
  await expect(page.locator("#view-after")).toBeDisabled();
  await expect(page.locator("#download-image")).toBeDisabled();
  expect(downloads).toHaveLength(0);
});

test("real five-type findings link list, keyboard and image boxes; unselected account stays untouched", async ({
  page,
}) => {
  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await page.goto("/");
  const pending = page.waitForResponse("**/api/scan");
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/all.png");
  const response = await pending;
  expect(response.status()).toBe(200);
  const result = await response.json();
  await expect(page.locator("#finding-count")).toHaveText("5");
  await expect(page.locator("#result-status")).toContainText("Phát hiện 5");
  await expect(page.locator("#advanced-tools")).not.toHaveAttribute("open");
  await expect(page.locator("#start-scan")).not.toBeVisible();
  expect(downloads).toHaveLength(0);
  const bank = result.findings.find((f) => f.type === "BANK_ACCOUNT");
  expect(bank).toBeTruthy();
  const button = page.locator(`[data-focus="${bank.id}"]`),
    checkbox = page.locator(`[data-finding="${bank.id}"]`);
  await button.click();
  await expect(page.locator("#preview-canvas")).toHaveAttribute(
    "data-active-finding",
    bank.id,
  );
  await expect(page.locator(`[data-row="${bank.id}"]`)).toHaveClass(
    /is-active/,
  );
  const rect = await page.locator("#preview-canvas").boundingBox();
  const [x, y, right, bottom] = bank.bbox;
  await page.mouse.click(
    rect.x + ((x + right) / 2 / result.width) * rect.width,
    rect.y + ((y + bottom) / 2 / result.height) * rect.height,
  );
  await expect(checkbox).not.toBeChecked();
  await checkbox.focus();
  await checkbox.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeFocused();
  await checkbox.uncheck();
  await page.locator("#redact-selected").click();
  await expect(page.locator("#view-after")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(downloads).toHaveLength(0);
  await expect(page.locator("#selection-summary")).toContainText(
    "Đã che 4 vùng",
  );
  const pendingDownload = page.waitForEvent("download");
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await page.locator("#download-image").click();
  const exported = await readFile(await (await pendingDownload).path());
  const original = await readFile("sample_data/screenshots/all.png");
  const unchanged = await page.evaluate(
    async ({ a, b, bbox }) => {
      async function context(base64) {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return ctx;
      }
      const [source, output] = await Promise.all([context(a), context(b)]);
      const [x, y, right, bottom] = bbox;
      const before = source.getImageData(x, y, right - x, bottom - y).data,
        after = output.getImageData(x, y, right - x, bottom - y).data;
      return before.every((channel, index) => channel === after[index]);
    },
    {
      a: original.toString("base64"),
      b: exported.toString("base64"),
      bbox: bank.bbox,
    },
  );
  expect(unchanged).toBe(true);
  await page.screenshot({
    path: "test-results/phase25-review.png",
    fullPage: true,
  });
});

test("failed automatic scan offers retry and working manual marking without automatic export", async ({
  page,
}) => {
  let calls = 0;
  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await page.route("**/api/scan", (route) => {
    calls++;
    return calls <= 2
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            detail: {
              code: "OCR_UNAVAILABLE",
              message: "Chưa thể đọc ảnh. Hãy thử lại.",
            },
          }),
        })
      : route.continue();
  });
  await page.goto("/");
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/email.png");
  await expect(page.locator("#scan-recovery")).toBeVisible();
  await expect(page.locator("#retry-scan")).toBeEnabled();
  await page.locator("#retry-scan").click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.locator("#retry-scan")).toBeEnabled();
  await page.locator("#error-manual").click();
  await expect(page.locator("#advanced-tools")).toHaveAttribute("open");
  await expect(page.locator("#toggle-draw")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator(".coordinates summary").click();
  for (const [name, value] of Object.entries({
    x: "50",
    y: "5",
    width: "30",
    height: "25",
  }))
    await page.locator(`#coordinate-form [name="${name}"]`).fill(value);
  await page.locator('#coordinate-form [type="submit"]').click();
  await expect(page.locator("#finding-count")).toHaveText("1");
  // A manual region clears the message, but the retry action remains available in the image menu.
  await page.locator("#image-menu>summary").click();
  await page.locator("#start-scan").click();
  await expect(page.locator("#finding-count")).toHaveText("2");
  expect(calls).toBe(3);
  expect(downloads).toHaveLength(0);
  await expect(page.locator("#view-after")).toBeDisabled();
});

test("bank toggle affects automatic scan after returning to scanner, with exactly one API call", async ({
  page,
}) => {
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/scan")) calls++;
  });
  await page.goto("/");
  await page.locator('[data-nav="/configuration"]').click();
  await page.locator('[data-type="bank"]').uncheck();
  await page.locator('[data-nav="/scanner"]').click();
  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/all.png");
  await expect(page.locator("#finding-count")).toHaveText("4");
  await expect(page.locator("#findings-list")).not.toContainText(
    "Tài khoản ngân hàng",
  );
  expect(calls).toBe(1);
});
