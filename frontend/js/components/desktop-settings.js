import { getDetectionConfig } from "../services/config-service.js";
import {
  getDesktopStatus,
  desktopMutation,
} from "../services/desktop-service.js";

export const desktopSettingsView = () =>
  `<section class="settings-section desktop-settings"><div class="section-title"><h2>Tự nhận diện screenshot — Windows</h2><span id="agent-state" class="setting-value" role="status">Đang kết nối…</span></div><div class="setting-list"><div class="setting-row"><div><strong>Theo dõi thư mục đã cho phép</strong><small>Chỉ ảnh PNG/JPEG mới; bạn quyết định vùng cần che.</small></div><label class="switch"><input id="agent-enabled" type="checkbox" disabled aria-label="Bật tự nhận diện screenshot"><span></span></label></div><div class="setting-row"><div><strong>Cảnh báo nổi trên màn hình</strong><small>Giữ cửa sổ cảnh báo đến khi bạn đóng hoặc mở ảnh.</small></div><label class="switch"><input id="agent-popup" type="checkbox" disabled aria-label="Bật cảnh báo nổi trên màn hình"><span></span></label></div><div class="setting-row agent-folder-row"><div><strong>Thư mục Screenshots</strong><small id="agent-folder">Chưa chọn thư mục</small></div><button id="agent-choose-folder" class="button secondary small-button" disabled>Chọn thư mục</button></div><div class="setting-row"><p id="agent-message" class="small muted" role="status">Đang kiểm tra agent local.</p><button id="agent-check" class="text-button">Kiểm tra kết nối</button></div><details class="advanced-details"><summary>Cách bật chức năng</summary><p>Cài dependencies desktop, dừng server cũ rồi chạy <code>python -m desktop_agent.main</code>. Mở PWA tại địa chỉ agent, chọn thư mục bằng hộp thoại Windows và bật theo dõi. Win+PrtScn phải lưu vào đúng thư mục này.</p><p>Để tắt hoàn toàn agent và backend, nhấn Ctrl+C trong terminal chạy agent. Không tự khởi động cùng Windows, không đọc clipboard hoặc tự chụp màn hình.</p></details></div></section>`;

export function mountDesktopSettings(main) {
  const $ = (selector) => main.querySelector(selector);
  let disposed = false,
    pending = false,
    version = 0;
  const controller = new AbortController();
  function state(value) {
    $("#agent-state").textContent = value.running ? "Running" : "Stopped";
    $("#agent-enabled").checked = !!value.running;
    $("#agent-enabled").disabled = !value.available || !value.folder || pending;
    $("#agent-choose-folder").disabled = !value.available || pending;
    $("#agent-popup").checked = value.popup_enabled !== false;
    $("#agent-popup").disabled = !value.available || pending;
    $("#agent-folder").textContent = value.folder || "Chưa chọn thư mục";
    $("#agent-folder").title = value.folder || "";
    $("#agent-message").textContent = !value.available
      ? "Chưa có companion. Mở hướng dẫn bên dưới để chạy agent."
      : value.enabled && !value.running
        ? "Theo dõi đã gián đoạn. Kiểm tra thư mục và bật lại."
        : value.error
          ? {
              invalid_image: "Có ảnh chưa đọc được; agent vẫn chờ ảnh mới.",
              scan_failed:
                "OCR chưa xử lý được ảnh. Kiểm tra Tesseract và ngôn ngữ.",
              start_failed: "Chưa bật được theo dõi thư mục.",
            }[value.error] || "Kiểm tra thư mục và kết nối agent."
          : value.popup_enabled && value.popup?.failed
            ? "Cửa sổ cảnh báo chưa hoạt động. Khởi động lại companion; thông báo vẫn nằm ở nút chuông."
            : value.notification === "failed"
              ? "Chưa gửi được thông báo Windows. Kiểm tra quyền thông báo."
              : value.running
                ? "Đang theo dõi. Ảnh có PII hoặc secrets sẽ có cảnh báo để mở review."
                : "Agent đã kết nối; theo dõi đang tắt.";
  }
  async function check() {
    const token = ++version;
    try {
      const value = await getDesktopStatus(controller.signal);
      if (!disposed && token === version) state(value);
    } catch {
      if (!disposed && token === version) {
        state({ available: false, running: false });
        $("#agent-message").textContent =
          "Không kết nối được agent local. Kiểm tra terminal và địa chỉ PWA.";
      }
    }
  }
  async function mutate(path, body, timeout) {
    if (pending) return;
    pending = true;
    version++;
    for (const selector of [
      "#agent-enabled",
      "#agent-popup",
      "#agent-choose-folder",
      "#agent-check",
    ])
      $(selector).disabled = true;
    $("#agent-message").textContent =
      path === "folder"
        ? "Chọn thư mục trong hộp thoại Windows đang mở."
        : "Đang cập nhật theo dõi…";
    try {
      const result = await desktopMutation(path, body, timeout);
      if (!disposed) {
        pending = false;
        state(result);
      }
    } catch (error) {
      if (!disposed) {
        pending = false;
        await check();
        $("#agent-message").textContent = error.message;
      }
    } finally {
      pending = false;
      if (!disposed) $("#agent-check").disabled = false;
    }
  }
  $("#agent-enabled").onchange = (event) =>
    mutate(
      "control",
      { enabled: event.target.checked, config: getDetectionConfig() },
      35000,
    );
  $("#agent-popup").onchange = (event) =>
    mutate("popup", { enabled: event.target.checked });
  $("#agent-choose-folder").onclick = () => mutate("folder", undefined, 180000);
  $("#agent-check").onclick = check;
  check();
  const timer = setInterval(() => {
    if (!pending) check();
  }, 5000);
  return () => {
    disposed = true;
    version++;
    controller.abort();
    clearInterval(timer);
  };
}
