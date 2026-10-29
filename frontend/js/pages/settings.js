import { icon } from "../components/icons.js";
import { heading, toast } from "../components/ui.js";
import {
  getDetectionConfig,
  updateDetectionConfig,
  resetDetectionConfig,
} from "../services/config-service.js";
import { getBackendHealth } from "../services/scanner-service.js";
export function settingsPage(main) {
  let config = getDetectionConfig(),
    disposed = false;
  function render() {
    main.innerHTML =
      heading("", "Cài đặt", "Điều chỉnh cách bảo vệ của bạn.") +
      `
      <section class="panel settings-panel"><div class="section-title"><h2>Chế độ quét</h2>${icon("shield")}</div><div class="mode-grid"><label class="mode-card ${config.mode === "auto" ? "selected" : ""}"><input type="radio" name="mode" value="auto" ${config.mode === "auto" ? "checked" : ""}>${icon("image")}<strong>Tự động</strong><span>Quét ngay khi chọn ảnh.</span></label><label class="mode-card ${config.mode === "manual" ? "selected" : ""}"><input type="radio" name="mode" value="manual" ${config.mode === "manual" ? "checked" : ""}>${icon("scan")}<strong>Thủ công</strong><span>Quét khi bạn sẵn sàng.</span></label><div class="mode-card future" aria-disabled="true">${icon("clock")}<strong>Giám sát nền</strong><span>Chưa hỗ trợ</span></div></div></section>
      <div class="settings-columns"><section class="panel settings-panel"><div class="section-title"><h2>Nhận diện</h2>${icon("sliders")}</div><label class="setting-field"><span><strong>Độ nhạy</strong></span><select id="sensitivity"><option value="low">Thấp</option><option value="balanced">Cân bằng</option><option value="high">Cao</option></select></label><label class="setting-field"><span><strong>Ngôn ngữ</strong></span><select id="language"><option value="vie+eng">Tiếng Việt + English</option><option value="vie">Tiếng Việt</option><option value="eng">English</option></select></label><details class="advanced-details"><summary>Về kết quả nhận diện</summary><p>Độ nhạy Thấp/Cân bằng/Cao tương ứng ngưỡng OCR 60%/20%/0%. Điểm luật là heuristic, không phải xác suất. Thiếu gói tiếng Việt sẽ dùng tiếng Anh nếu có.</p></details></section><section class="panel settings-panel"><div class="section-title"><h2>Quyền riêng tư</h2>${icon("lock")}</div><div class="privacy-row">${icon("check")} Không lưu ảnh hoặc kết quả lâu dài.</div><div class="privacy-row">${icon("check")} OCR tại máy chủ ứng dụng, không dùng cloud.</div><button id="reset-settings" class="button secondary small-button">${icon("trash")} Khôi phục mặc định</button></section></div>
      <details class="panel settings-panel system-details"><summary>Trạng thái hệ thống</summary><div class="system-grid"><div><span>OCR</span><strong id="settings-ocr">Đang kiểm tra…</strong></div><div><span>Canvas</span><strong class="mint-text">Sẵn sàng</strong></div><div><span>Ứng dụng ngoại tuyến</span><strong id="sw-status">Đang kiểm tra…</strong></div><div><span>Kết nối</span><strong id="settings-network">${navigator.onLine ? "Trực tuyến" : "Ngoại tuyến"}</strong></div></div></details>`;
    main.querySelector("#sensitivity").value = config.sensitivity;
    main.querySelector("#language").value = config.language;
    getBackendHealth().then((health) => {
      const el = main.querySelector("#settings-ocr");
      if (!disposed && el)
        el.textContent = health.ocr_available
          ? `Sẵn sàng · ${(health.languages || []).join(" / ")}`
          : "Chưa kết nối";
    });
    const save = () => {
      const result = updateDetectionConfig(config);
      toast(
        result.persisted ? "Đã lưu cài đặt." : "Đã áp dụng trong phiên này.",
      );
    };
    main.querySelectorAll('[name="mode"]').forEach(
      (input) =>
        (input.onchange = () => {
          config.mode = input.value;
          save();
          render();
        }),
    );
    for (const id of ["sensitivity", "language"])
      main.querySelector(`#${id}`).onchange = (event) => {
        config[id] = event.target.value;
        save();
      };
    main.querySelector("#reset-settings").onclick = () => {
      const dialog = document.createElement("dialog");
      dialog.className = "confirm-dialog";
      dialog.innerHTML = `<h2>Khôi phục mặc định?</h2><p>Các quy tắc riêng sẽ bị xóa.</p><div class="actions"><button class="button secondary" data-cancel>Hủy</button><button class="button primary" data-confirm>Khôi phục</button></div>`;
      main.append(dialog);
      dialog.showModal();
      dialog.onclose = () => dialog.remove();
      dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
      dialog.querySelector("[data-confirm]").onclick = () => {
        config = resetDetectionConfig().config;
        dialog.close();
        render();
        toast("Đã khôi phục mặc định.");
      };
    };
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.getRegistration().then((reg) => {
        const el = main.querySelector("#sw-status");
        if (!disposed && el)
          el.textContent = reg?.active ? "Sẵn sàng" : "Chưa sẵn sàng";
      });
    else main.querySelector("#sw-status").textContent = "Không hỗ trợ";
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
