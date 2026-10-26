import { icon } from "../components/icons.js";
import { heading, notice } from "../components/ui.js";
import { DATA_TYPES, getDetectionConfig } from "../services/config-service.js";
export function dashboardPage(main) {
  const config = getDetectionConfig();
  const enabled = DATA_TYPES.filter((t) => config.types[t.id]);
  main.innerHTML =
    heading(
      "KHÔNG GIAN BẢO VỆ CỦA BẠN",
      "An tâm hơn khi chia sẻ.",
      "Kiểm tra hình ảnh. Che thông tin riêng tư. Giữ quyền kiểm soát.",
      `<span class="badge mint">${icon("shield")} Xử lý trên thiết bị</span>`,
    ) +
    `
    <section class="hero panel">
      <div class="hero-copy"><span class="eyebrow mint-text"><span class="live-dot"></span> QUYỀN RIÊNG TƯ BẮT ĐẦU TỪ BẠN</span>
      <h2>Một bức ảnh.<br>Nhiều điều cần <em>bảo vệ.</em></h2>
      <p>Đừng để thông tin cá nhân đi cùng mỗi lần chia sẻ.<br>Kiểm tra và che những chi tiết bạn muốn giữ riêng.</p>
      <div class="actions"><a class="button primary" href="#/scanner">${icon("scan")} Kiểm tra hình ảnh ${icon("arrow")}</a><a class="button ghost" href="#/scanner?demo">Thử với ảnh mẫu</a></div>
      <div class="hero-foot">${icon("lock")} Không tải ảnh lên máy chủ <span>·</span> Không cần tài khoản</div></div>
      <div class="hero-art" aria-hidden="true"><div class="radar radar-one"></div><div class="radar radar-two"></div><div class="radar radar-three"></div><div class="orbit-line"></div><div class="shield-art">${icon("shield")}</div><span class="floating-tag tag-one">${icon("mail")} Email cá nhân ${icon("check")}</span><span class="floating-tag tag-two">${icon("card")} Thông tin định danh ${icon("lock")}</span><span class="art-caption"><span class="live-dot"></span> PRIVATE BY DESIGN</span></div>
    </section>
    <div class="status-grid">
      <article class="panel stat-card"><span class="icon-tile mint">${icon("shield")}</span><div><p>Chế độ bảo vệ</p><h3>${config.mode === "auto" ? "Quét khi nhập ảnh" : "Quét thủ công"}</h3><span class="small muted">Bạn chủ động chọn ảnh để kiểm tra</span></div></article>
      <article class="panel stat-card"><span class="icon-tile blue">${icon("sliders")}</span><div><p>Phạm vi phát hiện</p><h3>${enabled.length}<span class="muted stat-unit"> / 6 loại dữ liệu</span></h3><a class="small text-link" href="#/configuration">Quản lý cấu hình ${icon("arrow")}</a></div></article>
      <article class="panel stat-card"><span class="icon-tile amber">${icon("cpu")}</span><div><p>Bộ nhận diện OCR</p><h3>Chế độ mô phỏng</h3><span class="small muted">OCR thực tế đang chờ tích hợp</span></div></article>
    </div>
    <div class="dashboard-bottom"><section class="panel data-panel"><div class="section-title"><div><p class="eyebrow">PHẠM VI BẢO VỆ</p><h2>Những thông tin cần giữ riêng</h2></div><a class="icon-button" href="#/configuration" aria-label="Cấu hình loại dữ liệu">${icon("arrow")}</a></div><div class="data-type-grid">${DATA_TYPES.map((t) => `<a href="#/configuration" class="data-type ${config.types[t.id] ? "" : "inactive"}"><span class="type-icon">${icon(t.icon)}</span><span>${t.short}</span><span class="type-state">${config.types[t.id] ? icon("check") : "Tắt"}</span></a>`).join("")}</div><p class="small muted panel-note">${icon("info")} Bạn có thể bật, tắt và thêm quy tắc theo nhu cầu.</p></section>
    <section class="panel steps-panel"><div class="section-title"><div><p class="eyebrow">BẮT ĐẦU THẬT ĐƠN GIẢN</p><h2>3 bước trước khi chia sẻ</h2></div>${icon("book")}</div><ol class="steps"><li><span>01</span><div><h3>Chọn hình ảnh</h3><p>Tải ảnh lên hoặc chụp bằng camera.</p></div></li><li><span>02</span><div><h3>Kiểm tra & chọn vùng</h3><p>Xem ảnh mẫu hoặc tự đánh dấu vùng riêng tư.</p></div></li><li><span>03</span><div><h3>Che & tải ảnh an toàn hơn</h3><p>Xem lại kết quả và tải xuống dưới dạng PNG.</p></div></li></ol></section></div>
    ${notice("Phase 1 · Nhận diện tự động đang ở chế độ mô phỏng với ảnh mẫu. Luôn kiểm tra lại toàn bộ ảnh trước khi chia sẻ.")}
    <footer class="page-footer"><span>Được xây dựng với sự tôn trọng quyền riêng tư.</span><span>SCREENGUARD+ <span class="muted">/</span> NHÓM 08</span></footer>`;
}
