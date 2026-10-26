import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8000",
    channel: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    launchOptions: { args: ["--use-fake-device-for-media-stream"] },
  },
  webServer: {
    command: "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000",
    url: "http://127.0.0.1:8000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
