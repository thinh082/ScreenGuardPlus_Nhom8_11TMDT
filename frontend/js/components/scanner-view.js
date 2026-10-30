import { icon } from "./icons.js";

export function scannerView() {
  return (
    `<div class="workflow-heading"><div><p class="workflow-eyebrow" id="workflow-eyebrow">BƯỚC 01 / 05</p><h1 id="workflow-title" tabindex="-1">Tiếp nhận ảnh</h1><p id="workflow-description">Bắt đầu từ một ảnh bạn muốn bảo vệ.</p></div><label class="workflow-jump"><span>Chuyển bước</span><select id="workflow-step-select" aria-label="Bước trong quy trình"><option value="1">01 · Tiếp nhận ảnh</option><option value="2">02 · Phát hiện rủi ro</option><option value="3">03 · Đánh giá chính sách</option><option value="4">04 · Che thông tin</option><option value="5">05 · Kiểm chứng & xuất</option></select></label><span id="scan-mode" class="sample-label" hidden></span></div>` +
    `
    <section id="intake-panel" class="intake-panel" aria-label="Tiếp nhận ảnh">
      <div id="intake-options" class="intake-options"></div>
      <div id="intake-upload"></div>
      <div id="received-image" class="received-image" hidden><span class="received-symbol">${icon("image")}</span><div><strong id="received-name"></strong><p id="received-state" role="status"></p></div><button id="intake-replace" class="button secondary">Đổi ảnh</button></div>
      <a class="companion-intake" href="#/notifications">${icon("bell")}<span>Ảnh từ Windows Companion</span>${icon("chevron")}</a>
    </section>
    <div class="mobile-scan-tabs" role="tablist" aria-label="Không gian kiểm tra"><button id="mobile-image-tab" role="tab" aria-selected="true" aria-controls="scan-image-panel" class="active">Hình ảnh</button><button id="mobile-findings-tab" role="tab" aria-selected="false" aria-controls="scan-findings-panel">Vùng cần kiểm tra <span id="mobile-finding-count">0</span></button></div>
    <div class="scanner-layout">
      <section class="scanner-workspace" aria-busy="false">
                <section class="workflow-policy" aria-labelledby="policy-title">
          <div class="policy-destination-card">
            <div class="destination-row">
              <div class="destination-info">
                <label for="destination-select" class="destination-title">Ngữ cảnh chia sẻ</label>
                <span class="destination-subtitle">Ảnh sẽ được chia sẻ ở đâu?</span>
              </div>
              <div class="destination-select-wrap" id="destination-slot"></div>
            </div>
          </div>
          <div id="policy-state-expired" class="policy-state-card policy-state-expired" hidden>
            <div class="policy-state-icon text-warning">${icon("clock")}</div>
            <div class="policy-state-content">
              <h3>Phiên quét đã hết hạn</h3>
              <p>Kết quả đánh giá trước đó không còn hiệu lực. Hãy quét lại ảnh để tiếp tục.</p>
              <div class="policy-state-actions">
                <button class="button primary small-button" id="policy-rescan-btn">${icon("scan")} Quét lại ảnh</button>
              </div>
            </div>
          </div>
          <div id="policy-state-empty" class="policy-state-card policy-state-empty" hidden>
            <div class="policy-state-icon text-muted">${icon("info")}</div>
            <div class="policy-state-content">
              <h3>Chưa phát hiện dữ liệu nhạy cảm</h3>
              <p>OCR chưa tìm thấy thông tin phù hợp với các quy tắc hiện tại. Hãy kiểm tra ảnh trước khi chia sẻ.</p>
              <div class="policy-empty-actions">
                <button class="button secondary small-button" id="policy-empty-recheck">Kiểm tra lại ảnh</button>
                <button class="button ghost small-button" id="policy-empty-manual">${icon("plus")} Đánh dấu thủ công</button>
              </div>
              <p class="small muted policy-empty-footnote">Quyết định dựa trên các vùng được phát hiện trong ảnh. Không bảo đảm tuyệt đối mọi văn bản đều an toàn.</p>
            </div>
          </div>
          <div id="policy-state-normal" class="policy-normal-view">
            <div class="policy-summary-cards">
              <div class="summary-card">
                <div class="summary-value" id="stat-detected">0</div>
                <div class="summary-label">Đã phát hiện</div>
              </div>
              <div class="summary-card">
                <div class="summary-value" id="stat-selected">0</div>
                <div class="summary-label">Dự kiến che</div>
              </div>
              <div class="summary-card summary-card-pending" id="stat-pending-box">
                <div class="summary-value" id="stat-pending">0</div>
                <div class="summary-label">Còn cần xử lý</div>
                <div class="summary-sub" id="stat-pending-sub"></div>
              </div>
            </div>
            <div class="policy-decision-card">
              <p class="workflow-eyebrow" id="policy-context">KẾ HOẠCH CHE · CHƯA ÁP DỤNG</p>
              <div class="policy-decision-row">
                <div class="policy-decision-badge-icon" id="policy-decision-icon">${icon("shield")}</div>
                <div class="policy-decision-heading">
                  <h2 id="policy-title" class="policy-title-text">Kế hoạch che đạt yêu cầu</h2>
                  <div id="policy-banner" class="policy-banner" role="status">Chưa đánh giá</div>
                  <p id="policy-desc" class="policy-desc-text">Các vùng dự kiến che đáp ứng chính sách. Ảnh chưa được xử lý.</p>
                </div>
              </div>
              <ul id="policy-reasons"></ul>
              <p id="policy-coverage" class="small muted"></p>
              <div class="policy-card-bottom">
                <p id="policy-note" class="small muted">Kết quả chỉ áp dụng cho các vùng đã phát hiện. Việc che pixel thực sự diễn ra ở Bước 04.</p>
                <div class="policy-footer-actions">
                  <button class="text-button" id="refresh-policy">Đánh giá lại</button>
                  <button class="button secondary small-button" id="policy-rescan" hidden>Quét lại ảnh</button>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div class="workspace-top-bar">
          <div class="security-controls"><select id="profile-select" class="small-select" aria-label="Chế độ bảo vệ"><option value="personal">Cá nhân + secrets</option><option value="security">IT / DevOps</option></select><select id="destination-select" class="small-select" aria-label="Mục đích chia sẻ"><option value="public">Công khai</option><option value="internal">Nội bộ</option></select></div>
        </div>
        <div id="dropzone" class="dropzone"><span class="upload-art">${icon("upload")}</span><h2>Chọn ảnh để bắt đầu</h2><p>Kéo thả ảnh vào đây hoặc chọn từ thiết bị.</p><div class="import-actions"><button class="button primary" id="choose-image">Chọn ảnh</button><button class="button secondary" id="open-camera">${icon("camera")} Chụp ảnh</button></div><span class="format-note">PNG, JPG, WebP · Tối đa 10 MB / 20 MP</span><button class="text-button sample-button" id="demo-image">Thử với ảnh mẫu</button></div>
        <input id="image-input" type="file" accept="image/png,image/jpeg,image/webp" hidden><input id="camera-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden>
        <div id="editor" hidden>
          <div class="editor-toolbar">
            <div class="segmented"><button id="view-before" class="active" aria-pressed="true">Ảnh gốc</button><button id="view-after" disabled aria-pressed="false">Sau khi che</button></div>
            <div class="image-actions"><button class="button ghost small-button" id="replace-image">Đổi ảnh</button><button class="icon-button" id="zoom-image" aria-label="Xem chi tiết ảnh" title="Xem chi tiết ảnh">${icon("zoom")}</button><details class="image-menu" id="image-menu"><summary class="icon-button" aria-label="Tùy chọn ảnh" title="Tùy chọn ảnh">${icon("more")}</summary><div class="image-menu-content"><button id="start-scan">${icon("scan")} Quét lại</button><button id="open-manual">${icon("plus")} Đánh dấu thủ công</button><button id="clear-image" disabled>${icon("trash")} Xóa ảnh</button></div></details></div>
          </div>
          <div class="canvas-stage"><canvas id="preview-canvas" tabindex="0" aria-label="Ảnh xem trước. Nhấn vùng được đánh dấu để chọn hoặc bỏ chọn."></canvas></div>
          <div class="canvas-meta"><span id="image-meta"></span><span id="view-label">Ảnh gốc</span></div>
          <details class="advanced-tools" id="advanced-tools"><summary>Nâng cao</summary><div class="manual-tools"><button id="toggle-draw" class="button secondary small-button" aria-pressed="false">${icon("plus")} Đánh dấu thủ công</button><span class="small muted" id="draw-hint">Kéo trên ảnh để chọn vùng.</span></div><details class="coordinates"><summary>Nhập tọa độ</summary><form id="coordinate-form"><label>X<input name="x" type="number" min="0" required value="0"></label><label>Y<input name="y" type="number" min="0" required value="0"></label><label>Rộng<input name="width" type="number" min="1" required></label><label>Cao<input name="height" type="number" min="1" required></label><button type="submit" class="button secondary small-button">Thêm vùng</button></form></details></details>
        </div>
        <div id="scan-progress" class="scan-progress" role="status" hidden><span class="scan-spinner" aria-hidden="true"></span><strong id="progress-label">Đang kiểm tra ảnh...</strong><span id="progress-number" hidden></span><progress hidden id="progress-bar" max="100" aria-label="Đang kiểm tra ảnh"></progress></div>
        <p id="scanner-error" class="error-text" role="alert"></p><div id="scan-recovery" class="scan-recovery" hidden><button id="retry-scan" class="button secondary small-button">Thử lại</button><button id="error-manual" class="button ghost small-button">Đánh dấu thủ công</button></div><p id="scan-warnings" class="small muted" role="status"></p>
      </section>
      <aside class="findings-panel">
        <div class="section-title"><h2 id="finding-title" aria-live="polite">Vùng cần kiểm tra</h2><span id="finding-count" hidden>0</span></div>
        <div id="result-status" class="result-status" aria-live="polite">Chưa có ảnh</div>
        <div id="selection-tools" class="selection-tools" hidden><button id="select-all" class="text-button">Chọn tất cả</button><button id="deselect-all" class="text-button">Bỏ chọn</button></div>
        <div id="findings-list" class="findings-list"></div>
        <div id="export-hash-pill" class="export-hash-pill" hidden role="status"></div>
        <div class="redaction-actions">
          <p id="selection-summary" role="status" class="small muted">Chọn ảnh để bắt đầu.</p>
          <button id="redact-selected" class="button primary full-width" disabled>Che 0 vùng</button>
          <button id="download-image" class="button primary full-width" disabled hidden>${icon("download")} Tải ảnh đã che</button>
          <button id="edit-redaction" class="button secondary full-width" hidden>Chỉnh lại</button>
        </div>
        <p class="findings-warning">OCR có thể bỏ sót. Kiểm tra ảnh trước khi chia sẻ.</p>
      </aside>
    </div>
    <div class="workflow-footer"><button class="button secondary" id="workflow-previous">Quay lại</button><p id="workflow-hint" role="status">Chọn ảnh để bắt đầu.</p><button class="button primary" id="workflow-next">Tiếp: Xem phát hiện ${icon("chevron")}</button></div>
    <p class="scanner-tip">Xử lý local · Bạn quyết định trước khi chia sẻ.</p>
    <dialog id="image-detail-dialog" class="image-detail-dialog"><div class="section-title"><h2>Xem chi tiết ảnh</h2><button id="close-image-detail" class="icon-button" aria-label="Đóng ảnh chi tiết">${icon("x")}</button></div><p class="small muted">Cuộn để xem ảnh ở kích thước gốc.</p><div class="detail-image-viewport"><canvas id="detail-canvas" aria-label="Ảnh ở kích thước gốc; nhấn vùng được đánh dấu để chọn."></canvas></div></dialog>
    <dialog id="camera-dialog" class="camera-dialog"><div class="section-title"><h2>Chụp ảnh</h2><button id="close-camera" class="icon-button" aria-label="Đóng camera">${icon("x")}</button></div><video id="camera-video" autoplay playsinline muted></video><p id="camera-error" role="alert" class="error-text"></p><div class="actions"><button id="capture-photo" class="button primary" disabled>Chụp ảnh</button><button id="native-camera" class="button secondary">Camera thiết bị</button></div><p class="small muted">Camera chỉ hoạt động khi cửa sổ này mở.</p></dialog>`
  );
}
