import { icon } from "../components/icons.js";
import { heading } from "../components/ui.js";
import { DATA_TYPES, getDetectionConfig } from "../services/config-service.js";
import { getBackendHealth } from "../services/scanner-service.js";
export function dashboardPage(main) {
  const config = getDetectionConfig();
  main.innerHTML =
    heading(
      "",
      "Tổng quan",
      "Mọi thứ sẵn sàng trước khi chia sẻ.",
      `<a class="button primary" href="#/scanner">${icon("plus")} Kiểm tra ảnh</a>`,
    ) +
    `
    <section class="overview-banner panel"><span class="overview-shield">${icon("shield")}</span><div><h2>Giữ riêng điều quan trọng.</h2><p>Chọn ảnh, kiểm tra và che thông tin cá nhân.</p></div><a class="button secondary" href="#/scanner?demo">Thử ảnh mẫu ${icon("arrow")}</a></section>
    <div class="overview-stats"><article class="panel stat-card">${icon("cpu")}<div><span>OCR</span><h3 id="dashboard-ocr">Đang kiểm tra…</h3><small id="dashboard-languages">Python backend</small></div></article><article class="panel stat-card">${icon("scan")}<div><span>Chế độ quét</span><h3>${config.mode === "auto" ? "Tự động khi nhập ảnh" : "Thủ công"}</h3><a href="#/settings">Thay đổi ${icon("arrow")}</a></div></article></div>
    <section class="panel overview-types"><div class="section-title"><h2>Dữ liệu đang bảo vệ</h2><a class="text-link" href="#/configuration">Chỉnh sửa ${icon("arrow")}</a></div><div class="type-chips">${DATA_TYPES.map((t) => `<span class="type-chip ${config.types[t.id] ? "enabled" : "disabled"}">${icon(t.icon)}${t.short}${config.types[t.id] ? icon("check") : ""}</span>`).join("")}</div></section>
    <div class="quick-guide"><span><b>01</b> Chọn ảnh</span>${icon("chevron")}<span><b>02</b> Kiểm tra vùng</span>${icon("chevron")}<span><b>03</b> Che & tải xuống</span></div>`;
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
