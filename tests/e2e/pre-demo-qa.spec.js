import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

test("pre-demo: clean screenshot stays silent; terminal secret review BLOCKs then exports correct PNG and hash", async ({
  browser,
}) => {
  test.setTimeout(60000);
  execFileSync("python", ["-m", "tests.qa.generate"], { windowsHide: true });
  // Every path stays in this separate QA worktree, never the demo screenshot folder.
  const root = path.resolve("tmp/pre-demo-browser");
  await mkdir(root, { recursive: true });
  const directory = path.join(root, `run-${Date.now()}`);
  await mkdir(directory);
  const baseURL = "http://127.0.0.1:8044";
  let logs = "";
  const server = spawn(
    "python",
    [
      "tests/support/desktop_server.py",
      "--port",
      "8044",
      "--directory",
      directory,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk) => (logs += chunk));
  server.stderr.on("data", (chunk) => (logs += chunk));
  let context;
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`${baseURL}/api/health`)).ok;
          } catch {
            return false;
          }
        },
        { timeout: 10000 },
      )
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
      "tests/qa/fixtures/youtube-public.png",
      path.join(directory, "Screenshots", "clean.png"),
    );
    page = await context.newPage();
    await page.goto("/#/settings");
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const session = await (
            await fetch("/api/desktop/session", {
              headers: { "X-ScreenGuard-Client": "pwa" },
            })
          ).json();
          return (
            await (
              await fetch("/api/desktop/status", {
                headers: { "X-ScreenGuard-CSRF": session.csrf },
              })
            ).json()
          ).scanned;
        }),
      )
      .toBe(1);
    await page.goto("/#/notifications");
    await expect(page.locator(".notification-row")).toHaveCount(0);
    await page.close();
    await copyFile(
      "tmp/pre-demo-fixtures/acceptance.png",
      path.join(directory, "Screenshots", "terminal.png"),
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
    expect(JSON.stringify(entries)).not.toContain("DemoPass123!");
    page = await context.newPage();
    let scans = 0,
      downloads = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/scan")) scans++;
    });
    page.on("download", () => downloads++);
    await page.goto("/#/notifications");
    await expect(page.locator(".notification-row")).toHaveCount(1);
    const reviewed = page.waitForResponse(
      (r) =>
        r.url().includes("/api/desktop/reviews/") &&
        r.request().method() === "GET",
    );
    await page.locator(".notification-row a").click();
    const review = await (await reviewed).json();
    expect(
      createHash("sha256")
        .update(Buffer.from(review.image, "base64"))
        .digest("hex"),
    ).toBe(
      createHash("sha256")
        .update(await readFile("tmp/pre-demo-fixtures/acceptance.png"))
        .digest("hex"),
    );
    expect(scans).toBe(0);
    const password = review.result.findings.find(
      (f) => f.type === "DB_CREDENTIAL",
    );
    expect(password).toBeTruthy();
    await expect(page.locator("#finding-title")).toContainText("2 vùng");
    const [x, y, right, bottom] = password.bbox;
    const correctImage = await page.evaluate(
      async ({ base64 }) => {
        const source = new Image();
        source.src = `data:image/png;base64,${base64}`;
        await source.decode();
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.getContext("2d").drawImage(source, 0, 0);
        const shown = document.querySelector("#preview-canvas");
        return (
          canvas.width === shown.width &&
          canvas.height === shown.height &&
          [...canvas.getContext("2d").getImageData(5, 5, 10, 10).data].every(
            (v, i) =>
              v === shown.getContext("2d").getImageData(5, 5, 10, 10).data[i],
          )
        );
      },
      { base64: review.image },
    );
    expect(correctImage).toBe(true);
    await page.locator(`[data-finding="${password.id}"]`).uncheck();
    await page.locator("#redact-selected").click();
    const denied = page.waitForResponse((r) => r.url().endsWith("/api/export"));
    await page.locator("#download-image").click();
    expect((await denied).status()).toBe(403);
    expect(downloads).toBe(0);
    await expect(page.locator("#scanner-error")).toContainText(
      "Còn vùng bắt buộc che",
    );
    await page.locator("#select-all").click();
    await page.locator("#redact-selected").click();
    const exported = page.waitForResponse((r) =>
      r.url().endsWith("/api/export"),
    );
    const download = page.waitForEvent("download");
    await page.locator("#download-image").click();
    const response = await exported;
    expect(response.status()).toBe(200);
    const bytes = await readFile(await (await download).path());
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      response.headers()["x-image-hash"],
    );
    const verified = await page.evaluate(
      async ({ base64, bbox, original }) => {
        async function ctx(data) {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          canvas.getContext("2d").drawImage(image, 0, 0);
          return canvas.getContext("2d");
        }
        const [out, source] = await Promise.all([ctx(base64), ctx(original)]);
        const [x, y, r, b] = bbox;
        const p = out.getImageData(x, y, r - x, b - y).data;
        return {
          size: [out.canvas.width, out.canvas.height],
          opaque: [...p].every((v, i) => v === [17, 24, 39, 255][i % 4]),
          untouched: [...out.getImageData(5, 5, 10, 10).data].every(
            (v, i) => v === source.getImageData(5, 5, 10, 10).data[i],
          ),
        };
      },
      {
        base64: bytes.toString("base64"),
        bbox: [x, y, right, bottom],
        original: review.image,
      },
    );
    expect(verified).toEqual({
      size: [review.result.width, review.result.height],
      opaque: true,
      untouched: true,
    });
    expect(downloads).toBe(1);
    expect(logs).not.toContain("DemoPass123!");
    await page.screenshot({
      path: "test-results/pre-demo-acceptance.png",
      fullPage: true,
    });
  } finally {
    await context?.close();
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (
      path.dirname(directory) === root &&
      path.basename(directory).startsWith("run-")
    )
      await rm(directory, { recursive: true, force: true });
  }
});
