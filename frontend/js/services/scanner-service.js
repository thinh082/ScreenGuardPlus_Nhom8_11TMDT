import { mockScan } from "./mock-scanner.js";
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 20_000_000;
export function validateImage(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Chỉ hỗ trợ ảnh PNG, JPG hoặc WebP.");
  if (!file.size || file.size > MAX_BYTES)
    throw new Error("Ảnh phải có dung lượng từ 1 byte đến 10 MB.");
  return true;
}
export async function decodeImage(file) {
  validateImage(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > MAX_PIXELS)
      throw new Error("Ảnh quá lớn. Vui lòng chọn ảnh tối đa 20 megapixel.");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas;
  } catch (error) {
    throw new Error(
      error.message.includes("megapixel")
        ? error.message
        : "Không đọc được ảnh. Vui lòng chọn tệp ảnh hợp lệ.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function scanImage(
  image,
  config,
  { fixtureId = null, signal, onProgress = () => {} } = {},
) {
  if (!image?.width || !image?.height)
    throw new Error("Chưa có ảnh để kiểm tra.");
  if (fixtureId)
    for (let step = 0; step < 4; step++) {
      signal?.throwIfAborted();
      await new Promise((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new DOMException("Đã hủy", "AbortError"));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", abort);
          resolve();
        }, 180);
        signal?.addEventListener("abort", abort, { once: true });
      });
      signal?.throwIfAborted();
      onProgress(null, "Đang kiểm tra ảnh mẫu mô phỏng…");
    }
  if (fixtureId) return mockScan(fixtureId, config);
  signal?.throwIfAborted();
  onProgress(null, "Đang chuẩn bị ảnh…");
  const blob = await new Promise((resolve) =>
    image.toBlob(resolve, "image/png"),
  );
  signal?.throwIfAborted();
  if (!blob || blob.size > MAX_BYTES)
    throw new Error(
      "Ảnh PNG sau chuyển đổi vượt 10 MB hoặc không xuất được. Hãy chọn ảnh nhỏ hơn.",
    );
  const form = new FormData();
  form.append("image", blob, "scan.png");
  form.append("config", JSON.stringify(config));
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 35000);
  const abort = () => timeout.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    onProgress(null, "Đang đọc văn bản trong ảnh…");
    const response = await fetch("./api/scan", {
      method: "POST",
      body: form,
      signal: timeout.signal,
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok && result?.detail?.code === "OCR_UNAVAILABLE")
      throw new Error(
        "Bộ kiểm tra ảnh chưa sẵn sàng. Hãy thử lại hoặc đánh dấu thủ công.",
      );
    if (!response.ok && result?.detail?.code === "OCR_FAILED")
      throw new Error(
        "Chưa đọc được ảnh. Hãy thử ảnh rõ hơn hoặc đánh dấu thủ công.",
      );
    if (!response.ok)
      throw new Error(
        typeof result?.detail === "string"
          ? result.detail
          : result?.detail?.message ||
              "Chưa xử lý được ảnh. Hãy thử lại hoặc đánh dấu thủ công.",
      );
    onProgress(null, "Đang kiểm tra dữ liệu nhạy cảm…");
    const adapted = adaptScanResult(result, image);
    onProgress(null, "Đã kiểm tra xong.");
    return adapted;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Đã hủy", "AbortError");
    if (timeout.signal.aborted)
      throw new Error(
        "Kiểm tra ảnh quá thời gian chờ. Bạn vẫn có thể đánh dấu vùng thủ công.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Không kết nối được bộ kiểm tra ảnh. Kiểm tra mạng rồi thử lại hoặc đánh dấu thủ công.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export function adaptScanResult(result, image) {
  const types = {
    EMAIL: "email",
    PHONE: "phone",
    CITIZEN_ID: "cccd",
    STUDENT_ID: "student",
    BANK_ACCOUNT: "bank",
    CUSTOM: "custom",
  };
  if (
    result?.mode !== "real_ocr" ||
    result.width !== image.width ||
    result.height !== image.height ||
    !Array.isArray(result.findings) ||
    result.findings.length > 500
  )
    throw new Error("Kết quả không khớp với ảnh. Hãy thử lại.");
  const ids = new Set();
  const findings = result.findings.map((f) => {
    const [x, y, right, bottom] = f.bbox || [];
    if (
      !types[f.type] ||
      ids.has(f.id) ||
      typeof f.id !== "string" ||
      !["LOW", "MEDIUM", "HIGH"].includes(f.risk) ||
      ![x, y, right, bottom].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      right <= x ||
      bottom <= y ||
      right > image.width ||
      bottom > image.height ||
      typeof f.preview !== "string" ||
      typeof f.label !== "string" ||
      !Number.isFinite(f.score) ||
      f.score < 0 ||
      f.score > 1 ||
      !Number.isFinite(f.ocr_confidence) ||
      f.ocr_confidence < 0 ||
      f.ocr_confidence > 1
    )
      throw new Error("Chưa hiển thị được vùng nhận diện. Hãy thử lại.");
    ids.add(f.id);
    return {
      ...f,
      type: types[f.type],
      risk: f.risk.toLowerCase(),
      text: f.preview,
      box: { x, y, width: right - x, height: bottom - y },
    };
  });

  return { ...result, status: "complete", source: "ocr", findings };
}
export async function getBackendHealth() {
  try {
    const response = await fetch("./api/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error();
    const health = await response.json();
    return health.backend_available ? health : { ocr_available: false };
  } catch {
    return { backend_available: false, ocr_available: false };
  }
}
export function redactImage(image, selectedFindings) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = "#111827";
  for (const { box } of selectedFindings) {
    if (
      ![box?.x, box?.y, box?.width, box?.height].every(Number.isFinite) ||
      box.x < 0 ||
      box.y < 0 ||
      box.width <= 0 ||
      box.height <= 0 ||
      box.x + box.width > image.width ||
      box.y + box.height > image.height
    )
      throw new Error("Vùng che không hợp lệ.");
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }
  return canvas;
}
