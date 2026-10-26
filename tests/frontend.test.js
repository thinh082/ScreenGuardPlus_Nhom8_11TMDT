import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  getDetectionConfig,
  updateDetectionConfig,
  validateConfig,
} from "../frontend/js/services/config-service.js";
import { DEMO_ID, mockScan } from "../frontend/js/services/mock-scanner.js";
import {
  validateImage,
  scanImage,
  MAX_BYTES,
} from "../frontend/js/services/scanner-service.js";
import { escapeHTML } from "../frontend/js/components/ui.js";

test("mock fixture cannot be applied to arbitrary uploads", () => {
  assert.throws(
    () => mockScan("my-photo.png", DEFAULT_CONFIG),
    /chỉ xử lý ảnh mẫu/,
  );
  const config = structuredClone(DEFAULT_CONFIG);
  config.types.email = false;
  const result = mockScan(DEMO_ID, config);
  assert.equal(result.findings.length, 4);
  assert.ok(
    result.findings.every(
      (f) =>
        f.type !== "email" &&
        f.box.x + f.box.width <= result.width &&
        f.box.y + f.box.height <= result.height,
    ),
  );
  result.findings[0].text = "mutated";
  assert.notEqual(mockScan(DEMO_ID, config).findings[0].text, "mutated");
});
test("production seam explicitly reports unavailable and never returns mock findings", async () => {
  const result = await scanImage({ width: 960, height: 640 }, DEFAULT_CONFIG);
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.findings, []);
  assert.equal(result.source, "none");
});
test("cancelled scan does not publish results", async () => {
  const controller = new AbortController();
  const pending = scanImage({ width: 960, height: 640 }, DEFAULT_CONFIG, {
    fixtureId: DEMO_ID,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
test("file validation rejects wrong MIME, empty or oversized uploads", () => {
  assert.throws(() => validateImage({ type: "image/svg+xml", size: 20 }));
  assert.throws(() => validateImage({ type: "image/png", size: 0 }));
  assert.throws(() =>
    validateImage({ type: "image/jpeg", size: MAX_BYTES + 1 }),
  );
  assert.equal(validateImage({ type: "image/webp", size: 100 }), true);
});
test("configuration validates regex and limits; callers cannot mutate saved state", () => {
  const config = structuredClone(DEFAULT_CONFIG);
  config.rules.push({
    id: "rule1",
    name: "Test",
    kind: "regex",
    pattern: "[",
    risk: "high",
    enabled: true,
  });
  assert.throws(() => validateConfig(config), /Regex/);
  config.rules[0].pattern = "NV-[0-9]{6}";
  updateDetectionConfig(config);
  config.types.email = false;
  assert.equal(getDetectionConfig().types.email, true);
  const invalid = structuredClone(DEFAULT_CONFIG);
  invalid.mode = "background";
  assert.throws(() => validateConfig(invalid));
});
test("dynamic user text is escaped before rendering", () => {
  assert.equal(
    escapeHTML('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});
