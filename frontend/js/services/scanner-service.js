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
  for (const percent of [10, 35, 70, 100]) {
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
    onProgress(percent);
  }
  if (fixtureId) return mockScan(fixtureId, config);
  // Integration seam: replace with a real OCR provider. No pixels leave the browser in Phase 1.
  return {
    status: "unavailable",
    source: "none",
    width: image.width,
    height: image.height,
    findings: [],
    message:
      "OCR thực tế chưa tích hợp. Ảnh này chưa được nhận diện; hãy tự đánh dấu vùng cần che.",
  };
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
