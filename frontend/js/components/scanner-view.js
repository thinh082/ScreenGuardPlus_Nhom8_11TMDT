import { icon } from "./icons.js";
import { heading, notice } from "./ui.js";

export function scannerView() {
  return (
    heading(
      "",
      "Kiểm tra ảnh",
      "Thêm ảnh, ứng dụng tự kiểm tra.",
      `<span id="scan-mode" class="badge mint">${icon("shield")} Tự động</span>`,
    ) +
    `
    ${notice("Ảnh được xử lý tại máy chủ ứng dụng. Luôn kiểm tra lại trước khi chia sẻ.")}
    <div class="mobile-scan-tabs" role="tablist" aria-label="Không gian kiểm tra"><button id="mobile-image-tab" role="tab" aria-selected="true" aria-controls="scan-image-panel" class="active">${icon("image")} Hình ảnh</button><button id="mobile-findings-tab" role="tab" aria-selected="false" aria-controls="scan-findings-panel">${icon("scan")} Kết quả <span id="mobile-finding-count" class="count">0</span></button></div>
    <div class="scanner-layout">
      <section class="panel scanner-workspace" aria-busy="false">
        <div class="workspace-header"><h2>${icon("image")} Ảnh của bạn</h2><button id="clear-image" class="button subtle small-button" disabled>${icon("trash")} Xóa ảnh</button></div>
        <div id="dropzone" class="dropzone"><div class="upload-art">${icon("shield")}</div><h2>Kiểm tra ảnh trước khi chia sẻ</h2><p>Kéo thả hoặc chọn ảnh. Ứng dụng tự kiểm tra thông tin nhạy cảm.</p><div class="import-actions"><button class="button primary" id="choose-image">${icon("upload")} Chọn ảnh</button><button class="button secondary" id="open-camera">${icon("camera")} Chụp ảnh</button></div><span class="small muted">PNG, JPG, WebP · Tối đa 10 MB / 20 MP</span><button class="text-button sample-button" id="demo-image">Thử ảnh mẫu mô phỏng ${icon("arrow")}</button></div>
        <input id="image-input" type="file" accept="image/png,image/jpeg,image/webp" hidden><input id="camera-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden>
        <div id="editor" hidden>
          <div class="editor-toolbar"><div class="segmented"><button id="view-before" class="active" aria-pressed="true">Ảnh gốc</button><button id="view-after" disabled aria-pressed="false">Sau khi che</button></div><div class="image-actions"><button class="button secondary small-button" id="replace-image">${icon("upload")} Đổi ảnh</button><details class="image-menu" id="image-menu"><summary class="icon-button" aria-label="Tùy chọn ảnh" title="Tùy chọn ảnh">${icon("more")}</summary><div class="image-menu-content"><button id="start-scan">${icon("scan")} Quét lại</button><button id="open-manual">${icon("plus")} Đánh dấu thủ công</button></div></details></div></div>
          <div class="canvas-stage"><canvas id="preview-canvas" tabindex="0" aria-label="Ảnh xem trước. Nhấn vùng được đánh dấu để chọn hoặc bỏ chọn."></canvas></div>
          <div class="canvas-meta"><span id="image-meta"></span><span id="view-label">Ảnh gốc</span></div>
          <details class="advanced-tools" id="advanced-tools"><summary>Tùy chọn nâng cao</summary><div class="manual-tools"><button id="toggle-draw" class="button secondary small-button" aria-pressed="false">${icon("plus")} Đánh dấu thủ công</button><span class="small muted" id="draw-hint">Kéo trên ảnh để chọn vùng.</span></div><details class="coordinates"><summary>Nhập tọa độ (pixel)</summary><form id="coordinate-form"><label>X<input name="x" type="number" min="0" required value="0"></label><label>Y<input name="y" type="number" min="0" required value="0"></label><label>Rộng<input name="width" type="number" min="1" required></label><label>Cao<input name="height" type="number" min="1" required></label><button type="submit" class="button secondary small-button">Thêm vùng</button></form></details></details>
        </div>
        <div id="scan-progress" class="scan-progress" role="status" hidden><span class="scan-spinner" aria-hidden="true"></span><div><strong id="progress-label">Đang kiểm tra thông tin nhạy cảm…</strong><span id="progress-number">Đang đọc văn bản trong ảnh…</span></div><progress id="progress-bar" max="100" aria-label="Đang kiểm tra ảnh"></progress></div>
        <p id="scanner-error" class="error-text" role="alert"></p><div id="scan-recovery" class="scan-recovery" hidden><button id="retry-scan" class="button secondary small-button">${icon("scan")} Thử lại</button><button id="error-manual" class="button secondary small-button">${icon("plus")} Đánh dấu thủ công</button></div><p id="scan-warnings" class="small muted" role="status"></p>
        <div class="workspace-footer">${icon("lock")} Không lưu ảnh hoặc kết quả vào bộ nhớ đệm.</div>
      </section>
      <aside class="panel findings-panel"><div class="section-title"><h2>Kết quả <span id="finding-count" class="count">0</span></h2>${icon("scan")}</div><div id="result-status" class="result-status" aria-live="polite">Chưa có ảnh</div><div id="selection-tools" class="selection-tools" hidden><button id="select-all" class="text-button">Chọn tất cả</button><button id="deselect-all" class="text-button">Bỏ chọn</button></div><div id="findings-list" class="findings-list"></div><div class="redaction-actions"><p id="selection-summary" class="small muted">Chọn ảnh để bắt đầu.</p><button id="redact-selected" class="button primary full-width" disabled>${icon("eyeOff")} Xem ảnh sau khi che</button><button id="download-image" class="button secondary full-width" disabled>${icon("download")} Tải ảnh đã che</button></div><p class="small muted findings-warning">${icon("info")} Tự động có thể bỏ sót. Hãy kiểm tra lại ảnh.</p></aside>
    </div>
    <div class="scanner-tip">${icon("shield")}<span>Chỉ kiểm tra ảnh bạn chọn. Không theo dõi nền.</span></div>
    <dialog id="camera-dialog" class="camera-dialog"><div class="section-title"><h2>Chụp ảnh để kiểm tra</h2><button id="close-camera" class="icon-button" aria-label="Đóng camera">${icon("x")}</button></div><video id="camera-video" autoplay playsinline muted></video><p id="camera-error" role="alert" class="error-text"></p><div class="actions"><button id="capture-photo" class="button primary" disabled>${icon("camera")} Chụp ảnh</button><button id="native-camera" class="button secondary">Dùng camera thiết bị</button></div><p class="small muted">Camera chỉ hoạt động khi cửa sổ này mở.</p></dialog>`
  );
}
