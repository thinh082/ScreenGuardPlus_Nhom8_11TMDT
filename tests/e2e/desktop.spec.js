import { workflowStep } from "./workflow-helpers.js";
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("new secret screenshot alerts with PWA closed and opens an exportable review", async ({
  browser,
}) => {
  test.setTimeout(45000);
  const directory = await mkdtemp(
    path.join(tmpdir(), "screenguard-secret-e2e-"),
  );
  const port = 8018;
  const baseURL = `http://127.0.0.1:${port}`;
  const server = spawn(
    "python",
    [
      "tests/support/desktop_server.py",
      "--port",
      String(port),
      "--directory",
      directory,
    ],
    { stdio: "ignore", windowsHide: true },
  );
  let context;
  try {
    await expect
      .poll(async () => {
        try {
          return (await fetch(`${baseURL}/api/health`)).ok;
        } catch {
          return false;
        }
      })
      .toBe(true);
    context = await browser.newContext({ baseURL, acceptDownloads: true });
    let page = await context.newPage();
    await page.goto("/#/settings");
    await page.locator("#agent-choose-folder").click();
    await expect(page.locator("#agent-folder")).toContainText("Screenshots");
    await page.locator("#agent-enabled").check();
    await expect(page.locator("#agent-state")).toHaveText("Running");
    await page.close();
    await copyFile(
      "sample_data/screenshots/secrets.png",
      path.join(directory, "Screenshots", "new-secret.png"),
    );
    let entries;
    await expect
      .poll(
        async () => {
          try {
            entries = JSON.parse(
              await readFile(
                path.join(directory, "notifications.json"),
                "utf8",
              ),
            );
            return entries.length;
          } catch {
            return 0;
          }
        },
        { timeout: 15000 },
      )
      .toBe(1);
    expect(entries[0].count).toBe(2);
    page = await context.newPage();
    let scans = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/scan")) scans++;
    });
    const reviewed = page.waitForResponse(
      (r) =>
        r.url().includes("/api/desktop/reviews/") &&
        r.request().method() === "GET",
    );
    await page.goto(`/#/scanner?review=${entries[0].id}`);
    const result = (await (await reviewed).json()).result;
    expect(result.findings.map((f) => f.type)).toEqual([
      "DB_CREDENTIAL",
      "API_KEY",
    ]);
    await expect(page.locator("#finding-title")).toContainText("2 vùng");
    expect(scans).toBe(0);
    await workflowStep(page, 4);
    await page.locator("#redact-selected").click();
    const exported = page.waitForResponse((r) =>
      r.url().endsWith("/api/export"),
    );
    const downloaded = page.waitForEvent("download");
    await workflowStep(page, 5);
    await page.locator("#download-image").click();
    expect((await exported).status()).toBe(200);
    await downloaded;
    await expect(page.locator("#export-hash-pill")).toContainText("SHA-256");
  } finally {
    if (context) await context.close();
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    await rm(directory, { recursive: true, force: true });
  }
});

test("local agent works with PWA closed; notification review reuses real OCR and exports opaque PNG", async ({
  browser,
}) => {
  test.setTimeout(45000);
  const directory = await mkdtemp(path.join(tmpdir(), "screenguard-e2e-"));
  const port = Number(process.env.SCREENGUARD_AGENT_TEST_PORT || 8014);
  const baseURL = `http://127.0.0.1:${port}`;
  const server = spawn(
    "python",
    [
      "tests/support/desktop_server.py",
      "--port",
      String(port),
      "--directory",
      directory,
    ],
    { stdio: "ignore", windowsHide: true },
  );
  let context;
  try {
    await expect
      .poll(async () => {
        try {
          return (await fetch(`${baseURL}/api/health`)).ok;
        } catch {
          return false;
        }
      })
      .toBe(true);
    context = await browser.newContext({
      baseURL,
      acceptDownloads: true,
      viewport: { width: 1366, height: 768 },
    });
    let page = await context.newPage();
    await page.goto("/#/settings");
    await expect(page.locator("#agent-state")).toHaveText("Stopped");
    await expect(page.locator("#agent-enabled")).toBeDisabled();
    await page.locator("#agent-choose-folder").click();
    await expect(page.locator("#agent-folder")).toContainText("Screenshots");
    await page.locator("#agent-enabled").check();
    await expect(page.locator("#agent-state")).toHaveText("Running");
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(769);
    await page.screenshot({
      path: "test-results/phase4-agent-running.png",
      fullPage: true,
    });
    await page.close(); // There are now no PWA tabs; agent must scan independently.
    await copyFile(
      "sample_data/screenshots/all.png",
      path.join(directory, "Screenshots", "new.png"),
    );
    let notifications;
    await expect
      .poll(
        async () => {
          try {
            notifications = JSON.parse(
              await readFile(
                path.join(directory, "notifications.json"),
                "utf8",
              ),
            );
            return notifications.length;
          } catch {
            return 0;
          }
        },
        { timeout: 15000 },
      )
      .toBe(1);
    expect(notifications[0].count).toBe(5);
    page = await context.newPage();
    let browserScans = 0,
      downloads = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/scan")) browserScans++;
    });
    page.on("download", () => downloads++);
    await page.goto(`${baseURL}/#/notifications`);
    await expect(page.locator(".notification-row")).toHaveCount(1);
    await expect(page.locator(".notification-copy h2")).toContainText("5 vùng");
    await expect(page.locator("#notification-badge")).toHaveText("1");
    await page.screenshot({
      path: "test-results/notifications-inbox.png",
      fullPage: true,
    });
    // Inbox opens the same opaque review URL as the native warning.
    const pendingReview = page.waitForResponse(
      (response) =>
        response.url().includes("/api/desktop/reviews/") &&
        response.request().method() === "GET",
    );
    await page.locator(".notification-row a").click();
    const reviewed = await (await pendingReview).json();
    await expect(page.locator("#finding-title")).toHaveText("Phát hiện 5 vùng");
    expect(browserScans).toBe(0);
    expect(page.url()).toBe(`${baseURL}/#/scanner`);
    await expect(page.locator("#findings-list")).not.toContainText(
      "test.screenguard@example.com",
    );
    await page.screenshot({
      path: "test-results/phase4-desktop-review.png",
      fullPage: true,
    });
    await page.locator("[data-finding]").first().uncheck();
    await expect(page.locator("#redact-selected")).toHaveText("Che 4 vùng");
    await page.locator("[data-finding]").first().check();
    await workflowStep(page, 4);
    await page.locator("#redact-selected").click();
    expect(downloads).toBe(0);
    const pending = page.waitForEvent("download");
    await workflowStep(page, 5);
    await page.locator("#download-image").click();
    const bytes = await readFile(await (await pending).path());
    const opaque = await page.evaluate(
      async ({ base64, boxes }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${base64}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return boxes.map(([x, y, right, bottom]) => [
          ...ctx.getImageData(
            Math.floor((x + right) / 2),
            Math.floor((y + bottom) / 2),
            1,
            1,
          ).data,
        ]);
      },
      {
        base64: bytes.toString("base64"),
        boxes: reviewed.result.findings.map((f) => f.bbox),
      },
    );
    expect(opaque).toEqual(Array(5).fill([17, 24, 39, 255]));
    await page.locator('[data-nav="/configuration"]').click();
    const synced = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/desktop/config") &&
        response.request().method() === "POST",
    );
    await page.locator('[data-type="bank"]').uncheck();
    expect((await synced).status()).toBe(200);
    await copyFile(
      "sample_data/screenshots/bank.png",
      path.join(directory, "Screenshots", "bank-disabled.png"),
    );
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const api = await import("/js/services/desktop-service.js");
            return (await api.getDesktopStatus()).scanned;
          }),
        { timeout: 10000 },
      )
      .toBe(2);
    expect(
      JSON.parse(
        await readFile(path.join(directory, "notifications.json"), "utf8"),
      ),
    ).toHaveLength(1);
    await page.locator('[data-nav="/settings"]').click();
    await expect(page.locator("#agent-enabled")).toBeChecked();
    await page.locator("#agent-enabled").uncheck();
    await expect(page.locator("#agent-state")).toHaveText("Stopped");
    await page.screenshot({
      path: "test-results/phase4-agent-stopped.png",
      fullPage: true,
    });
    await copyFile(
      "sample_data/screenshots/email.png",
      path.join(directory, "Screenshots", "stopped.png"),
    );
    // Explicit connection check confirms the observer is absent, rather than assuming a timeout.
    await page.locator("#agent-check").click();
    await expect(page.locator("#agent-state")).toHaveText("Stopped");
    expect(
      JSON.parse(
        await readFile(path.join(directory, "notifications.json"), "utf8"),
      ),
    ).toHaveLength(1);
    await page.goto(`${baseURL}/#/scanner?review=${notifications[0].id}`);
    await expect(page.locator("#scanner-error")).toContainText("hết hạn");
  } finally {
    await context?.close();
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    // Only a verified OS-created task temp directory is removed.
    if (
      path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
      path.basename(directory).startsWith("screenguard-e2e-")
    )
      await rm(directory, { recursive: true, force: true });
  }
});

test("ordinary backend and expired review never claim screenshot monitoring is Running", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await expect(page.locator("#agent-state")).toHaveText("Stopped");
  await expect(page.locator("#agent-enabled")).toBeDisabled();
  await expect(page.locator("#agent-choose-folder")).toBeDisabled();
  await page.goto(
    "/#/scanner?review=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  );
  await expect(page.locator("#scanner-error")).toContainText(
    "desktop_agent.main",
  );
  await expect(page.locator("#finding-count")).toHaveText("0");
});

test("notification bell, mobile inbox and dismiss are visible and keyboard usable", async ({
  page,
}) => {
  let pending = true;
  const id = "A".repeat(43);
  await page.route("**/api/desktop/notifications", (route) =>
    route.fulfill({
      json: {
        available: true,
        items: pending
          ? [{ id, count: 3, created_at: "2026-10-29T10:00:00Z" }]
          : [],
        last_scan: { findings: 3 },
      },
    }),
  );
  await page.route(`**/api/desktop/reviews/${id}`, (route) => {
    pending = false;
    return route.fulfill({ json: { deleted: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#notification-badge")).toHaveText("1");
  await page.locator("#notifications-button").click();
  await expect(page.locator("h1")).toHaveText("Thông báo");
  await expect(page.locator(".notification-row")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/notifications-mobile.png",
    fullPage: true,
  });
  const dismiss = page.locator("[data-dismiss-notification]");
  await dismiss.focus();
  await dismiss.press("Enter");
  await expect(page.locator(".notification-row")).toHaveCount(0);
  await expect(page.locator("#notification-badge")).toBeHidden();
  await expect(page.locator(".notifications-empty h2")).toHaveText(
    "Không có ảnh đang chờ",
  );
});
