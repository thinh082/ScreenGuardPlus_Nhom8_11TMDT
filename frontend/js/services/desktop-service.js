import { getDetectionConfig } from "./config-service.js";
import { adaptScanResult, decodeImage, MAX_BYTES } from "./scanner-service.js";

let csrf;
let sessionRequest;
let mutations = Promise.resolve();

async function connect(signal) {
  if (csrf) return csrf;
  if (!sessionRequest)
    sessionRequest = fetch("./api/desktop/session", {
      headers: { "X-ScreenGuard-Client": "pwa" },
      credentials: "same-origin",
      cache: "no-store",
      signal: signal || AbortSignal.timeout(5000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Chưa kết nối được companion local.");
        csrf = (await response.json()).csrf;
        return csrf;
      })
      .finally(() => (sessionRequest = null));
  return sessionRequest;
}

export async function desktopRequest(
  path,
  { method = "GET", body, signal, timeout = 10000 } = {},
) {
  const token = await connect(signal);
  const response = await fetch(`./api/desktop/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal: signal || AbortSignal.timeout(timeout),
    headers: {
      "X-ScreenGuard-CSRF": token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 403) csrf = null;
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Không kết nối được companion.",
    );
  }
  return response.json();
}

export const getDesktopStatus = (signal) =>
  desktopRequest("status", { signal });
export function desktopMutation(path, body, timeout) {
  const job = mutations
    .catch(() => {})
    .then(() => desktopRequest(path, { method: "POST", body, timeout }));
  mutations = job;
  return job;
}
export async function syncDesktopConfig() {
  const config = getDetectionConfig();
  const state = await getDesktopStatus();
  if (state.available) {
    try {
      return await desktopMutation("config", config);
    } catch {
      const error = new Error(
        "Quy tắc PWA đã lưu, nhưng agent chưa nhận cấu hình mới. Kiểm tra kết nối trước khi chụp tiếp.",
      );
      error.desktopConfig = true;
      throw error;
    }
  }
}

export async function loadDesktopReview(id, signal) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(id))
    throw new Error("Mã phiên review không hợp lệ.");
  const data = await desktopRequest(`reviews/${encodeURIComponent(id)}`, {
    signal,
  });
  if (
    typeof data.image !== "string" ||
    data.image.length > Math.ceil(MAX_BYTES / 3) * 4
  )
    throw new Error("Ảnh review vượt giới hạn.");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(data.image), (char) => char.charCodeAt(0));
  } catch {
    throw new Error("Ảnh review không hợp lệ.");
  }
  const canvas = await decodeImage(
    new File([bytes], "Screenshot.png", { type: "image/png" }),
  );
  signal?.throwIfAborted();
  const result = adaptScanResult(data.result, canvas);
  // The browser now owns the review; discard the RAM session without retaining history.
  desktopRequest(`reviews/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {});
  return { canvas, result };
}
