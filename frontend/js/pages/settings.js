import { icon } from "../components/icons.js";
import { heading, toast } from "../components/ui.js";
import {
  getDetectionConfig,
  updateDetectionConfig,
  resetDetectionConfig,
} from "../services/config-service.js";
import { getBackendHealth } from "../services/scanner-service.js";
export function settingsPage(main) {
  let config = getDetectionConfig();
  let disposed = false;
  function render() {
    main.innerHTML =
      heading(
        "THEO CÁCH CỦA BẠN",
        "Cài đặt & bảo vệ",
        "Chủ động chọn cách kiểm tra. Quyền riêng tư luôn trong tầm tay.",
      ) +
      `
    <section class="panel settings-panel"><div class="section-title"><div><p class="eyebrow">CÁCH THỨC KIỂM TRA</p><h2>Chế độ bảo vệ</h2></div>${icon("shield")}</div><div class="mode-grid">
      <label class="mode-card ${config.mode === "manual" ? "selected" : ""}"><input type="radio" name="mode" value="manual" ${config.mode === "manual" ? "checked" : ""}>${icon("scan")}<strong>Quét thủ công</strong><span>Chọn ảnh và nhấn kiểm tra khi bạn sẵn sàng.</span><small>MANUAL SCAN</small></label>
      <label class="mode-card ${config.mode === "auto" ? "selected" : ""}"><input type="radio" name="mode" value="auto" ${config.mode === "auto" ? "checked" : ""}>${icon("image")}<strong>Quét khi nhập ảnh</strong><span>Tự bắt đầu kiểm tra sau khi bạn chọn một ảnh.</span><small>AUTO SCAN ON IMPORT</small></label>
      <div class="mode-card future" aria-disabled="true">${icon("clock")}<strong>Giám sát nền <span class="badge">Sắp tới</span></strong><span>Chưa hỗ trợ. Ứng dụng không theo dõi thư viện ảnh hoặc tự chụp màn hình.</span><small>FUTURE FEATURE</small></div>
    </div></section>
    <div class="settings-columns"><section class="panel settings-panel"><div class="section-title"><h2>Cấu hình nhận diện</h2>${icon("sliders")}</div><label class="setting-field"><span><strong>Độ nhạy</strong><small>Ngưỡng OCR tối thiểu: Thấp 60%, Cân bằng 20%, Cao 0%.</small></span><select id="sensitivity"><option value="low">Thấp</option><option value="balanced">Cân bằng</option><option value="high">Cao</option></select></label><label class="setting-field"><span><strong>Ngôn ngữ OCR</strong><small>Thiếu vie sẽ dự phòng sang eng khi có sẵn.</small></span><select id="language"><option value="vie+eng">Tiếng Việt + English</option><option value="vie">Tiếng Việt</option><option value="eng">English</option></select></label><p class="small muted">Độ nhạy và ngôn ngữ áp dụng cho OCR thật. Điểm luật là heuristic, không phải xác suất.</p></section>
    <section class="panel settings-panel"><div class="section-title"><h2>Quyền riêng tư</h2>${icon("lock")}</div><div class="privacy-row"><span>${icon("check")} Không lưu ảnh hoặc OCR text lâu dài</span><span class="badge mint">Luôn bật</span></div><div class="privacy-row"><span>${icon("check")} Ảnh được gửi tới Python backend</span><span class="badge mint">Luôn bật</span></div><p class="small muted">Cấu hình được lưu trên trình duyệt này. Nhấn “Xóa ảnh” trong trình quét hoặc tải lại trang để giải phóng ảnh và kết quả.</p><button id="reset-settings" class="button secondary">${icon("trash")} Khôi phục cấu hình mặc định</button></section></div>
    <section class="panel settings-panel"><div class="section-title"><h2>Trạng thái hệ thống</h2><span class="badge">PHASE 2</span></div><div class="system-grid"><div><span>Giao diện & Canvas</span><strong class="mint-text">${icon("check")} Sẵn sàng</strong></div><div><span>OCR / PII thực tế</span><strong id="settings-ocr">Đang kiểm tra…</strong></div><div><span>Offline app shell</span><strong id="sw-status">Đang kiểm tra…</strong></div><div><span>Kết nối mạng</span><strong id="settings-network">${navigator.onLine ? "Trực tuyến" : "Ngoại tuyến"}</strong></div></div></section>`;
    main.querySelector("#sensitivity").value = config.sensitivity;
    main.querySelector("#language").value = config.language;
    getBackendHealth().then((health) => {
      const el = main.querySelector("#settings-ocr");
      if (!disposed && el)
        el.textContent = health.ocr_available
          ? `Tesseract · ${(health.languages || []).join(", ")}`
          : "OCR chưa khả dụng · kiểm tra Tesseract/backend";
    });
    function save() {
      const result = updateDetectionConfig(config);
      toast(
        result.persisted ? "Đã lưu cài đặt." : "Đã áp dụng trong phiên này.",
      );
    }
    main.querySelectorAll('[name="mode"]').forEach((input) =>
      input.addEventListener("change", () => {
        config.mode = input.value;
        save();
        render();
      }),
    );
    ["sensitivity", "language"].forEach((id) =>
      main.querySelector(`#${id}`).addEventListener("change", (event) => {
        config[id] = event.target.value;
        save();
      }),
    );
    main.querySelector("#reset-settings").addEventListener("click", () => {
      const dialog = document.createElement("dialog");
      dialog.className = "confirm-dialog";
      dialog.innerHTML = `<h2>Khôi phục cấu hình?</h2><p>Các quy tắc tùy chỉnh sẽ bị xóa. Ảnh đang mở không bị thay đổi.</p><div class="actions"><button class="button secondary" data-cancel>Hủy</button><button class="button primary" data-confirm>Khôi phục</button></div>`;
      main.append(dialog);
      dialog.showModal();
      dialog.addEventListener("close", () => dialog.remove());
      dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
      dialog.querySelector("[data-confirm]").onclick = () => {
        config = resetDetectionConfig().config;
        dialog.close();
        toast("Đã khôi phục cấu hình mặc định.");
        render();
      };
    });
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.getRegistration().then((reg) => {
        const el = main.querySelector("#sw-status");
        if (el) el.textContent = reg?.active ? "Đã sẵn sàng" : "Chưa sẵn sàng";
      });
    else
      main.querySelector("#sw-status").textContent = "Trình duyệt không hỗ trợ";
  }
  render();
  const network = () => {
    const el = main.querySelector("#settings-network");
    if (el) el.textContent = navigator.onLine ? "Trực tuyến" : "Ngoại tuyến";
  };
  window.addEventListener("online", network);
  window.addEventListener("offline", network);
  return () => {
    disposed = true;
    window.removeEventListener("online", network);
    window.removeEventListener("offline", network);
  };
}
