import { icon } from "../components/icons.js";
import { heading } from "../components/ui.js";
import { DATA_TYPES, getDetectionConfig } from "../services/config-service.js";
import { getBackendHealth } from "../services/scanner-service.js";
export function dashboardPage(main) {
  const config = getDetectionConfig();
  main.innerHTML =
    heading("", "Tổng quan", "") +
    `
    <section class="onboarding"><h2>Giữ riêng điều quan trọng.</h2><p class="subtitle">Chọn ảnh, kiểm tra các vùng nhạy cảm và che trước khi chia sẻ.</p><a class="button primary" href="#/scanner">Kiểm tra ảnh ${icon("arrow")}</a><div class="onboarding-state"><span>OCR</span><strong id="dashboard-ocr">Đang kiểm tra…</strong><small id="dashboard-languages"></small></div><div class="onboarding-types"><h3>Đang tìm trong ảnh</h3><p>${
      DATA_TYPES.filter((t) => t.id !== "custom" && config.types[t.id])
        .map((t) => t.short)
        .join(" · ") || "Chưa bật loại dữ liệu mặc định"
    }${config.types.custom && config.rules.some((r) => r.enabled) ? ` · ${config.rules.filter((r) => r.enabled).length} quy tắc riêng` : ""}</p><a class="text-link" href="#/configuration">Chỉnh quy tắc ${icon("arrow")}</a></div><ol class="onboarding-steps"><li>Chọn hoặc chụp ảnh để kiểm tra tự động.</li><li>Xem lại từng vùng, thêm hoặc bỏ chọn nếu cần.</li><li>Che thông tin, kiểm tra ảnh rồi tải xuống.</li></ol></section>`;
  let active = true;
  getBackendHealth().then((health) => {
    if (!active) return;
    main.querySelector("#dashboard-ocr").textContent = health.ocr_available
      ? "Sẵn sàng"
      : "Chưa kết nối";
    main.querySelector("#dashboard-languages").textContent =
      health.backend_available
        ? `Tesseract · ${(health.languages || []).join(" / ") || "chưa có ngôn ngữ"}`
        : "Kiểm tra Python backend";
  });
  return () => {
    active = false;
  };
}
