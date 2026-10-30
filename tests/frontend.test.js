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
  exportSecureImage,
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
test("real adapter sends multipart configuration to same-origin backend and never substitutes mock", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "./api/scan");
    assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store");
    assert.ok(options.body instanceof FormData);
    assert.equal(JSON.parse(options.body.get("config")).language, "vie+eng");
    assert.equal(options.body.get("image").type, "image/png");
    return Response.json({
      mode: "real_ocr",
      width: 960,
      height: 640,
      findings: [],
      language: "eng",
      warnings: [],
      scan_ticket: "ticket-xyz",
      policy_decision: "ALLOW",
    });
  };
  try {
    const image = {
      width: 960,
      height: 640,
      toBlob: (callback) =>
        callback(new Blob(["pixels"], { type: "image/png" })),
    };
    const result = await scanImage(image, DEFAULT_CONFIG);
    assert.equal(result.status, "complete");
    assert.deepEqual(result.findings, []);
    assert.equal(result.source, "ocr");
    assert.equal(result.scan_ticket, "ticket-xyz");
    globalThis.fetch = async () => {
      throw new TypeError("offline");
    };
    await assert.rejects(scanImage(image, DEFAULT_CONFIG), /bộ kiểm tra ảnh/);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.throws(() => updateDetectionConfig(invalid));
  const legacy = structuredClone(DEFAULT_CONFIG);
  legacy.mode = "manual";
  assert.equal(updateDetectionConfig(legacy).config.mode, "auto");
});
test("dynamic user text is escaped before rendering", () => {
  assert.equal(
    escapeHTML('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});

test("legacy PII settings gain secret defaults without resetting disabled types", () => {
  const config = structuredClone(DEFAULT_CONFIG);
  delete config.profile;
  delete config.destination;
  for (const key of [
    "db_credential",
    "api_key",
    "private_key",
    "jwt_token",
    "internal_ip",
  ])
    delete config.types[key];
  config.types.email = false;
  const migrated = validateConfig(config);
  assert.equal(migrated.profile, "personal");
  assert.equal(migrated.types.email, false);
  assert.equal(migrated.types.db_credential, true);
  migrated.types.db_credential = false;
  assert.equal(validateConfig(migrated).types.db_credential, false);
});
test("exportSecureImage sends ticket and redactions to /api/export", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "./api/export");
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    assert.equal(body.ticket, "ticket-123");
    assert.equal(body.destination, "public");
    return new Response(new Blob(["safe-png"], { type: "image/png" }), {
      status: 200,
      headers: {
        "X-Image-Hash": "hash123",
        "X-Policy-Decision": "ALLOW",
      },
    });
  };
  try {
    const { hash, decision } = await exportSecureImage("ticket-123", [
      { x: 10, y: 10, width: 50, height: 20 },
    ]);
    assert.equal(hash, "hash123");
    assert.equal(decision, "ALLOW");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
