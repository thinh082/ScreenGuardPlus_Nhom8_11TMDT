import { workflowStep } from "./workflow-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("dashboard navigation, actual configuration counts, install help, and clean console", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tiếp nhận ảnh", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.locator("#install-app").click();
  await expect(page.locator("#install-dialog")).toBeVisible();
  await page.locator("#close-install").click();
  for (const [href, title] of [
    ["/configuration", "Quy tắc bảo vệ"],
    ["/settings", "Cài đặt"],
    ["/scanner", "Tiếp nhận ảnh"],
    ["/overview", "Tổng quan"],
  ]) {
    await page.locator(`[data-nav="${href}"]`).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("fixed demo: scan, choose, redact, before/after, PNG pixels, clear", async ({
  page,
}) => {
  await page.goto("/#/scanner?demo");
  await expect(page.locator("#finding-count")).toHaveText("5");
  await expect(page.locator("#scan-progress")).toBeHidden();
  await page.locator("#deselect-all").click();
  await expect(page.locator("#redact-selected")).toBeDisabled();
  await page.locator('[data-finding="demo-email"]').check();
  await workflowStep(page, 4);
  await page.locator("#redact-selected").click();
  await expect(page.locator("#view-after")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const downloadPromise = page.waitForEvent("download");
  await workflowStep(page, 5);
  await page.locator("#download-image").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("screenguard-protected.png");
  const bytes = await readFile(await download.path());
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      redacted: [...ctx.getImageData(300, 230, 1, 1).data],
      untouched: [...ctx.getImageData(100, 200, 1, 1).data],
    };
  }, bytes.toString("base64"));
  expect(pixels).toEqual({
    width: 960,
    height: 640,
    redacted: [17, 24, 39, 255],
    untouched: [255, 255, 255, 255],
  });
  await page.screenshot({
    path: "test-results/scanner-desktop.png",
    fullPage: true,
  });
  await workflowStep(page, 4);
  await page.locator("#view-before").click();
  await expect(page.locator("#view-before")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#select-all").click();
  await expect(page.locator("#download-image")).toBeDisabled();
  await workflowStep(page, 4);
  await page.locator("#image-menu>summary").click();
  await page.locator("#clear-image").click();
  await expect(page.locator("#dropzone")).toBeVisible();
  await expect(page.locator("#finding-count")).toHaveText("0");
});

test("user upload gets real OCR, manual redaction and same-origin request", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") requests.push(request.url());
  });
  await page.goto("/#/scanner");
  await page
    .locator("#image-input")
    .setInputFiles("frontend/icons/icon-192.png");
  await expect(page.locator("#result-status")).toHaveText(
    "Không phát hiện thông tin nhạy cảm. Vui lòng kiểm tra lại ảnh trước khi chia sẻ.",
  );
  await expect(page.locator("#finding-count")).toHaveText("0");
  await workflowStep(page, 4);
  await page.locator("#advanced-tools>summary").click();
  await page.locator("details.coordinates summary").click();
  for (const [name, value] of Object.entries({
    x: "20",
    y: "20",
    width: "30",
    height: "40",
  }))
    await page.locator(`#coordinate-form [name="${name}"]`).fill(value);
  await page.locator('#coordinate-form [type="submit"]').click();
  await expect(page.locator("#finding-count")).toHaveText("1");
  await workflowStep(page, 4);
  await page.locator("#redact-selected").click();
  await expect(page.locator("#download-image")).toBeEnabled();
  await page.locator("[data-remove]").click();
  await expect(page.locator("#finding-count")).toHaveText("0");
  await expect(page.locator("#download-image")).toBeDisabled();
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).pathname).toBe("/api/scan");
});

test("drag and pointer marking use image coordinates", async ({ page }) => {
  let scans = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/scan")) scans++;
  });
  await page.goto("/#/scanner");
  const data = await readFile("frontend/icons/icon-192.png");
  const transfer = await page.evaluateHandle(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "photo.png", { type: "image/png" }),
      );
      return transfer;
    },
    [...data],
  );
  await page
    .locator("#dropzone")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator("#result-status")).toContainText(
    "Không phát hiện thông tin nhạy cảm",
  );
  await workflowStep(page, 4);
  await page.locator("#advanced-tools>summary").click();
  await page.locator("#toggle-draw").click();
  const box = await page.locator("#preview-canvas").boundingBox();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.mouse.up();
  await expect(page.locator("#finding-count")).toHaveText("1");
  await expect(page.locator(".finding-info strong")).toHaveText(
    "Vùng thủ công 1",
  );
  expect(scans).toBe(1);
});

test("configuration persists, validates regex, escapes custom input, filters demo", async ({
  page,
}) => {
  await page.goto("/#/configuration");
  await page.locator('[data-type="email"]').uncheck();
  await page.reload();
  await expect(page.locator('[data-type="email"]')).not.toBeChecked();
  await page.locator("#add-rule").click();
  await page
    .locator('#rule-form [name="name"]')
    .fill("<img src=x onerror=alert(1)>");
  await page.locator('#rule-form [name="kind"]').selectOption("regex");
  await page.locator('#rule-form [name="pattern"]').fill("[");
  await page.locator('#rule-form [type="submit"]').click();
  await expect(page.locator("#rule-error")).toContainText("Regex không hợp lệ");
  await page.locator('#rule-form [name="pattern"]').fill("NV-[0-9]{6}");
  await page.locator('#rule-form [type="submit"]').click();
  await expect(page.locator(".rule-info strong")).toHaveText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator(".rule-info img")).toHaveCount(0);
  await page.locator("[data-rule]").uncheck();
  await page.reload();
  await expect(page.locator("[data-rule]")).not.toBeChecked();
  await page.locator("[data-delete]").click();
  await expect(page.locator(".rule-row")).toHaveCount(0);
  await page.goto("/#/scanner?demo");
  await expect(page.locator("#finding-count")).toHaveText("4");
  await expect(page.locator('[data-finding="demo-email"]')).toHaveCount(0);
});

test("legacy manual preference still scans on import; reset restores defaults", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("screenguard.config.v1"))
      localStorage.setItem(
        "screenguard.config.v1",
        JSON.stringify({
          types: {
            email: true,
            phone: true,
            cccd: true,
            student: true,
            bank: true,
            custom: true,
          },
          rules: [],
          mode: "manual",
          language: "vie+eng",
          sensitivity: "balanced",
        }),
      );
  });
  await page.goto("/#/settings");
  await page.locator("#language").selectOption("vie");
  await page.locator("#sensitivity").selectOption("high");
  await page.goto("/#/scanner?demo");
  await expect(page.locator("#finding-count")).toHaveText("5");
  await workflowStep(page, 4);
  await page.locator("#image-menu>summary").click();
  await page.locator("#start-scan").click();
  await expect(page.locator("#finding-count")).toHaveText("5");
  await page.locator('[data-nav="/settings"]').click();
  await page.locator("#reset-settings").click();
  await page.locator("[data-confirm]").click();
  await expect(page.locator('[name="mode"][value="auto"]')).toBeChecked();
  await expect(page.locator("#language")).toHaveValue("vie+eng");
});

test("invalid file and corrupt image show errors without fake results", async ({
  page,
}) => {
  await page.goto("/#/scanner");
  await page.locator("#image-input").setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.locator("#scanner-error")).toContainText(
    "Không đọc được ảnh",
  );
  await page.locator("#image-input").setInputFiles({
    name: "vector.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(page.locator("#scanner-error")).toContainText(
    "Chỉ hỗ trợ ảnh PNG",
  );
  await expect(page.locator("#finding-count")).toHaveText("0");
  await expect(page.locator("#dropzone")).toBeVisible();
});

test("camera capture is explicit and stream stops when dialog closes", async ({
  page,
  context,
}) => {
  let scans = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/scan")) scans++;
  });
  await context.grantPermissions(["camera"]);
  await page.goto("/#/scanner");
  await page.locator("#open-camera").click();
  await expect(page.locator("#capture-photo")).toBeEnabled();
  await page.evaluate(() => {
    window.testTracks = document.querySelector("video").srcObject.getTracks();
  });
  await page.locator("#capture-photo").click();
  await expect(page.locator("#camera-dialog")).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      window.testTracks.every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
  await expect(page.locator("#result-status")).toHaveText(
    "Không phát hiện thông tin nhạy cảm. Vui lòng kiểm tra lại ảnh trước khi chia sẻ.",
  );
  await expect(page.locator("#finding-count")).toHaveText("0");
  expect(scans).toBe(1);
});

test("camera denial has a useful fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
    });
  });
  await page.goto("/#/scanner");
  await page.locator("#open-camera").click();
  await expect(page.locator("#camera-error")).toContainText(
    "Quyền camera bị từ chối",
  );
  await expect(page.locator("#native-camera")).toBeEnabled();
  await page.locator("#close-camera").click();
});

test("late camera and image operations are cancelled safely when leaving scanner", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          new Promise((resolve) => {
            window.finishCameraRequest = () => {
              const canvas = document.createElement("canvas");
              canvas.width = 10;
              canvas.height = 10;
              const stream = canvas.captureStream();
              window.testTracks = stream.getTracks();
              resolve(stream);
            };
          }),
      },
    });
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this);
      await new Promise((resolve) => {
        window.finishImageDecode = resolve;
      });
    };
  });
  await page.goto("/#/scanner");
  await page.locator("#open-camera").click();
  await page.evaluate(() => {
    location.hash = "#/configuration";
  });
  await expect(page.locator("h1")).toHaveText("Quy tắc bảo vệ");
  await page.evaluate(() => window.finishCameraRequest());
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.testTracks.every((track) => track.readyState === "ended"),
      ),
    )
    .toBe(true);
  await page.locator('[data-nav="/scanner"]').click();
  await page
    .locator("#image-input")
    .setInputFiles("frontend/icons/icon-192.png");
  await page.waitForFunction(
    () => typeof window.finishImageDecode === "function",
  );
  await page.locator('[data-nav="/settings"]').click();
  await page.evaluate(() => window.finishImageDecode());
  await expect(page.locator("h1")).toHaveText("Cài đặt");
  expect(errors).toEqual([]);
});

test("offline shell covers every page, with no API or user data in cache", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  await page.evaluate(() => fetch("/api/health"));
  await context.setOffline(true);
  for (const path of ["/", "/configuration", "/settings", "/scanner?demo"]) {
    await page.goto(`/#${path}`);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("#network-status")).toContainText("Ngoại tuyến");
  }
  await expect(page.locator("#finding-count")).toHaveText("5");
  const cached = await page.evaluate(async () => {
    const result = [];
    for (const key of await caches.keys())
      for (const request of await (await caches.open(key)).keys())
        result.push(request.url);
    return result;
  });
  expect(cached.length).toBeGreaterThan(10);
  expect(
    cached.every(
      (url) =>
        !url.includes("/api/") &&
        !url.startsWith("blob:") &&
        !url.includes("?"),
    ),
  ).toBe(true);
  await context.setOffline(false);
});

test("phone layout supports navigation and scanner without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  for (const path of ["/scanner", "/configuration", "/settings", "/overview"]) {
    await page.locator("#menu-button").click();
    await page.locator(`[data-nav="${path}"]`).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/#/scanner?demo");
  await expect(page.locator("#finding-count")).toHaveText("5");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/scanner-mobile.png",
    fullPage: true,
  });
});
