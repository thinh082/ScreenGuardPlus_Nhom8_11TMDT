import { icon } from "./icons.js";
import { heading } from "./ui.js";

export function scannerView() {
  return (
    heading(
      "",
      "Kiểm tra ảnh",
      "Thông tin nhạy cảm được tìm trước khi bạn chia sẻ.",
      `<span id="scan-mode" class="sample-label" hidden></span>`,
    ) +
    `
    <div class="mobile-scan-tabs" role="tablist" aria-label="Không gian kiểm tra"><button id="mobile-image-tab" role="tab" aria-selected="true" aria-controls="scan-image-panel" class="active">Hình ảnh</button><button id="mobile-findings-tab" role="tab" aria-selected="false" aria-controls="scan-findings-panel">Vùng cần kiểm tra <span id="mobile-finding-count">0</span></button></div>
    <div class="scanner-layout">
      <section class="scanner-workspace" aria-busy="false">
        <div id="dropzone" class="dropzone"><span class="upload-art">${icon("upload")}</span><h2>Chọn ảnh để bắt đầu</h2><p>Kéo thả ảnh vào đây hoặc chọn từ thiết bị.</p><div class="import-actions"><button class="button primary" id="choose-image">Chọn ảnh</button><button class="button secondary" id="open-camera">${icon("camera")} Chụp ảnh</button></div><span class="format-note">PNG, JPG, WebP · Tối đa 10 MB / 20 MP</span><button class="text-button sample-button" id="demo-image">Thử với ảnh mẫu</button></div>
        <input id="image-input" type="file" accept="image/png,image/jpeg,image/webp" hidden><input id="camera-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden>
        <div id="editor" hidden>
          <div class="editor-toolbar"><div class="segmented"><button id="view-before" class="active" aria-pressed="true">Ảnh gốc</button><button id="view-after" disabled aria-pressed="false">Sau khi che</button></div><div class="image-actions"><button class="button ghost small-button" id="replace-image">Đổi ảnh</button><button class="icon-button" id="zoom-image" aria-label="Xem chi tiết ảnh" title="Xem chi tiết ảnh">${icon("zoom")}</button><details class="image-menu" id="image-menu"><summary class="icon-button" aria-label="Tùy chọn ảnh" title="Tùy chọn ảnh">${icon("more")}</summary><div class="image-menu-content"><button id="start-scan">${icon("scan")} Quét lại</button><button id="open-manual">${icon("plus")} Đánh dấu thủ công</button><button id="clear-image" disabled>${icon("trash")} Xóa ảnh</button></div></details></div></div>
          <div class="canvas-stage"><canvas id="preview-canvas" tabindex="0" aria-label="Ảnh xem trước. Nhấn vùng được đánh dấu để chọn hoặc bỏ chọn."></canvas></div>
          <div class="canvas-meta"><span id="image-meta"></span><span id="view-label">Ảnh gốc</span></div>
          <details class="advanced-tools" id="advanced-tools"><summary>Nâng cao</summary><div class="manual-tools"><button id="toggle-draw" class="button secondary small-button" aria-pressed="false">${icon("plus")} Đánh dấu thủ công</button><span class="small muted" id="draw-hint">Kéo trên ảnh để chọn vùng.</span></div><details class="coordinates"><summary>Nhập tọa độ</summary><form id="coordinate-form"><label>X<input name="x" type="number" min="0" required value="0"></label><label>Y<input name="y" type="number" min="0" required value="0"></label><label>Rộng<input name="width" type="number" min="1" required></label><label>Cao<input name="height" type="number" min="1" required></label><button type="submit" class="button secondary small-button">Thêm vùng</button></form></details></details>
        </div>
        <div id="scan-progress" class="scan-progress" role="status" hidden><span class="scan-spinner" aria-hidden="true"></span><strong id="progress-label">Đang kiểm tra ảnh...</strong><span id="progress-number" hidden></span><progress hidden id="progress-bar" max="100" aria-label="Đang kiểm tra ảnh"></progress></div>
        <p id="scanner-error" class="error-text" role="alert"></p><div id="scan-recovery" class="scan-recovery" hidden><button id="retry-scan" class="button secondary small-button">Thử lại</button><button id="error-manual" class="button ghost small-button">Đánh dấu thủ công</button></div><p id="scan-warnings" class="small muted" role="status"></p>
      </section>
      <aside class="findings-panel"><div class="section-title"><h2 id="finding-title" aria-live="polite">Vùng cần kiểm tra</h2><span id="finding-count" hidden>0</span></div><div id="result-status" class="result-status" aria-live="polite">Chưa có ảnh</div><div id="selection-tools" class="selection-tools" hidden><button id="select-all" class="text-button">Chọn tất cả</button><button id="deselect-all" class="text-button">Bỏ chọn</button></div><div id="findings-list" class="findings-list"></div><div class="redaction-actions"><p id="selection-summary" role="status" class="small muted">Chọn ảnh để bắt đầu.</p><button id="redact-selected" class="button primary full-width" disabled>Che 0 vùng</button><button id="download-image" class="button primary full-width" disabled hidden>${icon("download")} Tải ảnh đã che</button><button id="edit-redaction" class="button secondary full-width" hidden>Chỉnh lại</button></div><p class="findings-warning">Kiểm tra lại toàn bộ ảnh trước khi chia sẻ.</p></aside>
    </div>
    <p class="scanner-tip">Ảnh được xử lý tại máy chủ ứng dụng, không gửi đến dịch vụ OCR bên thứ ba.</p>
    <dialog id="image-detail-dialog" class="image-detail-dialog"><div class="section-title"><h2>Xem chi tiết ảnh</h2><button id="close-image-detail" class="icon-button" aria-label="Đóng ảnh chi tiết">${icon("x")}</button></div><p class="small muted">Cuộn để xem ảnh ở kích thước gốc.</p><div class="detail-image-viewport"><canvas id="detail-canvas" aria-label="Ảnh ở kích thước gốc; nhấn vùng được đánh dấu để chọn."></canvas></div></dialog>
    <dialog id="camera-dialog" class="camera-dialog"><div class="section-title"><h2>Chụp ảnh</h2><button id="close-camera" class="icon-button" aria-label="Đóng camera">${icon("x")}</button></div><video id="camera-video" autoplay playsinline muted></video><p id="camera-error" role="alert" class="error-text"></p><div class="actions"><button id="capture-photo" class="button primary" disabled>Chụp ảnh</button><button id="native-camera" class="button secondary">Camera thiết bị</button></div><p class="small muted">Camera chỉ hoạt động khi cửa sổ này mở.</p></dialog>`
  );
}
