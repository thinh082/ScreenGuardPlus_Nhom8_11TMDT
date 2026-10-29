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
      <section class="settings-section"><h2>Quét ảnh</h2><div class="setting-list"><div class="setting-row"><div><strong>Tự động sau khi nhập ảnh</strong><small>Áp dụng khi chọn, thả hoặc chụp ảnh.</small></div><span class="setting-value">Đang bật</span><input class="sr-only" type="radio" name="mode" value="auto" checked disabled aria-label="Quét tự động"></div><div class="setting-row"><div><strong>Thủ công</strong><small>Chọn Quét lại trong menu tùy chọn ảnh.</small></div></div><div class="setting-row"><strong>Giám sát nền</strong><span class="muted">Chưa hỗ trợ</span></div></div></section>
      <div class="settings-columns"><section class="settings-section"><h2>Nhận diện</h2><div class="setting-list"><label class="setting-row"><strong>Ngôn ngữ</strong><select id="language"><option value="vie+eng">Tiếng Việt + English</option><option value="vie">Tiếng Việt</option><option value="eng">English</option></select></label><label class="setting-row"><strong>Độ nhạy</strong><select id="sensitivity"><option value="low">Thấp</option><option value="balanced">Cân bằng</option><option value="high">Cao</option></select></label><details class="advanced-details system-details"><summary>Chi tiết nhận diện</summary><div class="system-grid"><div><span>OCR</span><strong id="settings-ocr">Đang kiểm tra…</strong></div><div><span>Ứng dụng ngoại tuyến</span><strong id="sw-status">Đang kiểm tra…</strong></div><div><span>Kết nối</span><strong id="settings-network">${navigator.onLine ? "Trực tuyến" : "Ngoại tuyến"}</strong></div></div><p>Ngưỡng OCR Thấp / Cân bằng / Cao: 60% / 20% / 0%. Tài khoản có nhãn rõ vẫn có thể được đề xuất ở Cân bằng hoặc Cao khi đọc chưa rõ. Điểm luật là heuristic, không phải xác suất. Thiếu gói tiếng Việt sẽ dùng tiếng Anh nếu có.</p></details></div></section><section class="settings-section"><h2>Quyền riêng tư</h2><div class="setting-list"><div class="setting-row"><div><strong>Xử lý ảnh tại máy chủ ứng dụng</strong><small>Không dùng dịch vụ OCR bên thứ ba.</small></div></div><div class="setting-row"><div><strong>Ảnh và kết quả chỉ dùng trong phiên</strong><small>Không lưu vào lịch sử hoặc bộ nhớ ngoại tuyến.</small></div></div><div class="setting-row"><button id="reset-settings" class="text-button">Khôi phục mặc định</button></div></div></section></div>`;
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
