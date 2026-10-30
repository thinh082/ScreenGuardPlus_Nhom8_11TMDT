import { defineConfig } from "@playwright/test";
const port = process.env.SCREENGUARD_TEST_PORT || "8012";
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL,
    channel: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    launchOptions: { args: ["--use-fake-device-for-media-stream"] },
  },
  webServer: {
    command: `python -m uvicorn backend.main:app --host 127.0.0.1 --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
