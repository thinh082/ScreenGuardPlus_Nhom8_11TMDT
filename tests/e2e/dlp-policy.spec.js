import { workflowStep } from "./workflow-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ request }) => {
  const health = await (await request.get("/api/health")).json();
  test.skip(
    !health.ocr_available,
    "Real Tesseract unavailable; OCR browser integration was not run.",
  );
});

test("default personal profile detects a real DATABASE_PASSWORD screenshot", async ({
  page,
}) => {
  await page.goto("/#/scanner");
  await expect(page.locator("#profile-select")).toHaveValue("personal");
  let downloads = 0;
  page.on("download", () => downloads++);
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1100;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.font = "32px Consolas, monospace";
    ctx.fillText("DATABASE_PASSWORD=DemoPass123!", 35, 75);
    ctx.fillText("API_KEY=DemoApiKey1234567890ABCDEF", 35, 130);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const pending = page.waitForResponse((r) => r.url().endsWith("/api/scan"));
  await page.locator("#image-input").setInputFiles({
    name: "password.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  const response = await pending;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.findings.map((f) => f.type)).toEqual([
    "DB_CREDENTIAL",
    "API_KEY",
  ]);
  expect(result.findings[0].risk).toBe("CRITICAL");
  expect(JSON.stringify(result)).not.toContain("DemoPass123!");
  await workflowStep(page, 3);
  await expect(page.locator("#policy-banner")).toHaveClass(/policy-allowed/);
  await page.locator("[data-finding]").first().uncheck();
  await workflowStep(page, 4);
  await page.locator("#redact-selected").click();
  const blocked = page.waitForResponse((r) => r.url().endsWith("/api/export"));
  await workflowStep(page, 5);
  await page.locator("#download-image").click();
  expect((await blocked).status()).toBe(403);
  await expect(page.locator("#scanner-error")).toContainText(
    "Còn vùng bắt buộc che",
  );
  await expect(page.locator("#profile-select")).toBeEnabled();
  expect(downloads).toBe(0);
  await page.locator("#select-all").click();
  await workflowStep(page, 4);
  await page.locator("#redact-selected").click();
  await workflowStep(page, 5);
  await expect(page.locator("#policy-banner")).toHaveClass(/policy-allowed/);
  const exported = page.waitForResponse((r) => r.url().endsWith("/api/export"));
  const download = page.waitForEvent("download");
  await workflowStep(page, 5);
  await page.locator("#download-image").click();
  expect((await exported).status()).toBe(200);
  await download;
  expect(downloads).toBe(1);
  await expect(page.locator("#export-hash-pill")).toContainText("SHA-256");
  await page.screenshot({
    path: "test-results/phase5-password-review.png",
    fullPage: true,
  });
});

test("Phase 5 DLP: Security Profile blocks unredacted secrets and permits export after redaction", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/#/scanner");

  // Switch profile to 'security'
  await page.locator("#profile-select").selectOption("security");

  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/scan"),
  );

  await page
    .locator("#image-input")
    .setInputFiles("sample_data/screenshots/secrets.png");

  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = await response.json();

  expect(result.scan_ticket).toBeTruthy();
  expect(result.findings.length).toBeGreaterThanOrEqual(2);

  // Policy banner should display BLOCK warning
  const banner = page.locator("#policy-banner");
  await workflowStep(page, 3);
  await page.locator("#destination-select").selectOption("public");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveClass(/policy-allowed/);

  // Uncheck one critical finding to ensure unredacted state blocks export
  await page.locator("[data-finding]").first().uncheck();
  await expect(banner).toHaveClass(/policy-blocked/);

  // Click redact selected
  await workflowStep(page, 4);
  await page.locator("#redact-selected").click();

  // Policy should still be blocked because not all secrets are covered
  await workflowStep(page, 5);
  await expect(banner).toHaveClass(/policy-blocked/);

  const blocked = page.waitForResponse((r) => r.url().endsWith("/api/export"));
  await workflowStep(page, 5);
  await page.locator("#download-image").click();
  expect((await blocked).status()).toBe(403);
  await expect(page.locator("#scanner-error")).toContainText(
    "Còn vùng bắt buộc che",
  );

  // Now re-check all findings and redact all
  await page.locator("#select-all").click();
  await workflowStep(page, 4);
  await page.locator("#redact-selected").click();

  // Policy should now be ALLOWED
  await workflowStep(page, 5);
  await expect(banner).toHaveClass(/policy-allowed/);
  await expect(banner).toContainText("ALLOW");

  // Download secure image
  const downloaded = page.waitForEvent("download");
  await workflowStep(page, 5);
  await page.locator("#download-image").click();
  const downloadPath = await (await downloaded).path();
  const bytes = await readFile(downloadPath);
  expect(bytes.length).toBeGreaterThan(0);

  // Export hash pill should display the SHA-256 prefix
  const hashPill = page.locator("#export-hash-pill");
  await expect(hashPill).toBeVisible();
  await expect(hashPill).toContainText("SHA-256:");
  expect(errors).toEqual([]);
});
