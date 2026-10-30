import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

async function step(page, n) {
  await page.locator("#workflow-step-select").selectOption(String(n));
  await expect(page.locator("#main")).toHaveAttribute(
    "data-workflow-step",
    String(n),
  );
}
async function scan(page, file = "secrets") {
  const pending = page.waitForResponse((r) => r.url().endsWith("/api/scan"));
  await page
    .locator("#image-input")
    .setInputFiles(`sample_data/screenshots/${file}.png`);
  const response = await pending;
  expect(response.status()).toBe(200);
  const result = await response.json();
  await expect(page.locator("#finding-count")).toHaveText(
    String(result.findings.length),
  );
  return result;
}
async function decision(page, value) {
  await expect(page.locator("#policy-banner")).toHaveAttribute(
    "data-decision",
    value,
  );
}

test("five steps keep one OCR session; real policy blocks missing secret, then exports PNG and SHA-256", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let scans = 0,
    downloads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/scan")) scans++;
  });
  page.on("download", () => downloads++);
  await page.goto("/");
  await expect(page.locator(".workflow-nav button")).toHaveCount(5);
  await expect(page.locator(".workflow-link.is-complete")).toHaveCount(0);
  await expect(page.locator("h1")).toHaveText("Tiếp nhận ảnh");
  await page.screenshot({ path: "test-results/workflow-01-intake.png" });
  const result = await scan(page);
  expect(JSON.stringify(result.findings)).not.toContain("DemoPass123!");
  await expect(
    page.locator('[data-workflow-step="2"][aria-current="step"]'),
  ).toHaveCount(1);
  await page.screenshot({ path: "test-results/workflow-02-detection.png" });
  const password = result.findings.find((f) => f.type === "DB_CREDENTIAL");
  const id = page.locator(`[data-finding="${password.id}"]`);
  await id.uncheck();
  const saved = await page
    .locator("#preview-canvas")
    .evaluate((c) => c.toDataURL());
  const planned = page.waitForResponse((r) =>
    r.url().endsWith("/api/policy/evaluate"),
  );
  await step(page, 3);
  const policyResponse = await planned;
  expect(policyResponse.status()).toBe(200);
  expect((await policyResponse.json()).decision).toBe("BLOCK");
  expect(policyResponse.request().postDataJSON().ticket).toBe(
    result.scan_ticket,
  );
  await decision(page, "BLOCK");
  await page.screenshot({ path: "test-results/workflow-03-policy-block.png" });
  for (const n of [1, 2, 4, 3, 2]) {
    await step(page, n);
    await expect(id).not.toBeChecked();
    expect(await page.locator("#preview-canvas").evaluate((c) => c.width)).toBe(
      result.width,
    );
  }
  expect(
    await page.locator("#preview-canvas").evaluate((c) => c.toDataURL()),
  ).toBe(saved);
  expect(scans).toBe(1);
  expect(downloads).toBe(0);
  await step(page, 4);
  await page.locator("#redact-selected").click();
  await step(page, 5);
  await decision(page, "BLOCK");
  const denied = page.waitForResponse((r) => r.url().endsWith("/api/export"));
  await page.locator("#download-image").click();
  expect((await denied).status()).toBe(403);
  expect(downloads).toBe(0);
  await expect(page.locator("#scanner-error")).toContainText(
    "Còn vùng bắt buộc che",
  );
  await step(page, 4);
  await id.check();
  await page.locator("#redact-selected").click();
  await expect(page.locator("#view-after")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#toast")).toBeHidden({ timeout: 6000 });
  await page.screenshot({ path: "test-results/workflow-04-redaction.png" });
  await page.locator("#view-before").click();
  await expect(page.locator("#view-before")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#view-after").click();
  await step(page, 5);
  await decision(page, "ALLOW");
  const responsePromise = page.waitForResponse((r) =>
    r.url().endsWith("/api/export"),
  );
  const download = page.waitForEvent("download");
  await page.locator("#download-image").click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const bytes = await readFile(await (await download).path());
  const hash = createHash("sha256").update(bytes).digest("hex");
  expect(hash).toBe(response.headers()["x-image-hash"]);
  await expect(page.locator("#export-hash-pill")).toContainText(hash);
  await expect(
    page.locator('[data-workflow-step="5"].is-complete'),
  ).toHaveCount(1);
  await page.screenshot({ path: "test-results/workflow-05-export.png" });
  expect(scans).toBe(1);
  expect(downloads).toBe(1);
  expect(errors).toEqual([]);
});

test("WARN requires explicit confirmation; cancel preserves image and no download", async ({
  page,
}) => {
  await page.goto("/");
  const result = await scan(page, "email");
  await step(page, 4);
  await page.locator(`[data-finding="${result.findings[0].id}"]`).uncheck();
  await page.locator("#advanced-tools>summary").click();
  await page.locator(".coordinates>summary").click();
  for (const [name, value] of Object.entries({
    x: 0,
    y: 0,
    width: 15,
    height: 15,
  }))
    await page.locator(`#coordinate-form [name="${name}"]`).fill(String(value));
  await page.locator("#coordinate-form button").click();
  await page.locator("#redact-selected").click();
  await step(page, 5);
  await decision(page, "WARN");
  let downloads = 0;
  page.on("download", () => downloads++);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#download-image").click();
  await expect(page.locator("#download-image")).toBeEnabled();
  expect(downloads).toBe(0);
  const accepted = page.waitForResponse(
    (r) => r.url().endsWith("/api/export") && r.status() === 200,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#download-image").click();
  const response = await accepted;
  expect(response.request().postDataJSON().confirmed_warnings).toContain(
    "INTERNAL_DATA_WARNING",
  );
  await expect.poll(() => downloads).toBe(1);
});

test("expired ticket shows rescan guidance and retains the image and selections", async ({
  page,
}) => {
  await page.goto("/");
  await scan(page);
  await step(page, 4);
  await page.locator("#redact-selected").click();
  const image = await page
    .locator("#preview-canvas")
    .evaluate((c) => c.toDataURL());
  await page.route("**/api/policy/evaluate", (r) =>
    r.fulfill({
      status: 422,
      json: {
        detail: { code: "INVALID_TICKET", message: "Expired QA response" },
      },
    }),
  );
  await step(page, 5);
  await expect(page.locator("#policy-banner")).toContainText("hết hạn");
  await expect(page.locator("#download-image")).toBeDisabled();
  expect(
    await page.locator("#preview-canvas").evaluate((c) => c.toDataURL()),
  ).toBe(image);
  await step(page, 4);
  await expect(page.locator("[data-finding]:checked")).toHaveCount(2);
  await step(page, 5);
  await page.unroute("**/api/policy/evaluate");
  const rescanned = page.waitForResponse((r) => r.url().endsWith("/api/scan"));
  await page.locator("#policy-rescan").click();
  expect((await (await rescanned).json()).scan_ticket).toBeTruthy();
  await expect(page.locator("#main")).toHaveAttribute(
    "data-workflow-step",
    "2",
  );
});

test("late policy responses cannot replace the current selection decision", async ({
  page,
}) => {
  await page.goto("/");
  const result = await scan(page);
  let release, finished;
  const gate = new Promise((resolve) => (release = resolve));
  const done = new Promise((resolve) => (finished = resolve));
  let held = false;
  await page.route("**/api/policy/evaluate", async (route) => {
    const response = await route.fetch();
    if (!held) {
      held = true;
      await gate;
      try {
        await route.fulfill({ response });
      } finally {
        finished();
      }
    } else await route.fulfill({ response });
  });
  await step(page, 3);
  await expect.poll(() => held).toBe(true);
  const password = result.findings.find((f) => f.type === "DB_CREDENTIAL");
  await page.locator(`[data-finding="${password.id}"]`).uncheck();
  await decision(page, "BLOCK");
  release();
  await done;
  await decision(page, "BLOCK");
});

test("zero findings still allow deliberate preparation and secure PNG export", async ({
  page,
}) => {
  await page.goto("/");
  const result = await scan(page, "clean");
  expect(result.findings).toEqual([]);
  await step(page, 3);
  await decision(page, "ALLOW");
  await step(page, 4);
  await expect(page.locator("#redact-selected")).toHaveText("Chuẩn bị PNG");
  await page.locator("#redact-selected").click();
  await step(page, 5);
  await decision(page, "ALLOW");
  const download = page.waitForEvent("download");
  await page.locator("#download-image").click();
  expect(
    (await readFile(await (await download).path())).length,
  ).toBeGreaterThan(0);
  await expect(page.locator("#policy-note")).not.toContainText("100%");
});

test("keyboard and mobile/tablet workflow keep primary controls within the viewport", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 834, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator("#demo-image").click();
    await expect(page.locator("#finding-count")).toHaveText("5");
    for (const n of [2, 3, 4, 5, 1]) {
      await step(page, n);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const next = await page.locator("#workflow-previous").boundingBox();
      expect(next.y + next.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await page.screenshot({
      path: `test-results/workflow-mobile-${viewport.width}.png`,
    });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await step(page, 2);
  await page.locator('.workflow-nav [data-workflow-step="3"]').focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator('.workflow-nav [aria-current="step"]'),
  ).toHaveAttribute("data-workflow-step", "3");
  await page.locator("#workflow-previous").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toHaveAttribute(
    "data-workflow-step",
    "2",
  );
});
