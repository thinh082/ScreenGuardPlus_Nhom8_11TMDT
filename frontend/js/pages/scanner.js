import { icon } from "../components/icons.js";
import { heading, notice, escapeHTML, toast } from "../components/ui.js";
import { getDetectionConfig } from "../services/config-service.js";
import { createDemoCanvas, DEMO_ID } from "../services/mock-scanner.js";
import {
  decodeImage,
  scanImage,
  redactImage,
} from "../services/scanner-service.js";

export function scannerPage(main) {
  let original = null,
    redacted = null,
    fixtureId = null,
    findings = [],
    selected = new Set();
  let busy = false,
    view = "before",
    drawing = false,
    pointerStart = null,
    controller = null,
    stream = null,
    disposed = false,
    generation = 0,
    cameraGeneration = 0;
  main.innerHTML =
    heading(
      "KIỂM TRA TRƯỚC KHI CHIA SẺ",
      "Trình quét hình ảnh",
      "Chọn ảnh của bạn hoặc khám phá quy trình với tài liệu mẫu.",
      `<span id="scan-mode" class="badge amber">${icon("cpu")} OCR · Python backend</span>`,
    ) +
    `
    ${notice("Ảnh của bạn được gửi đến Python backend của ứng dụng để chạy Tesseract, không gửi đến dịch vụ OCR bên thứ ba. Kết quả có thể bỏ sót thông tin; hãy kiểm tra lại trước khi chia sẻ.")}
    <div class="scanner-layout"><section class="panel scanner-workspace"><div class="workspace-header"><h2>${icon("image")} Không gian làm việc</h2><button id="clear-image" class="button subtle small-button" disabled>${icon("trash")} Xóa ảnh</button></div>
      <div id="dropzone" class="dropzone"><div class="upload-art">${icon("upload")}</div><h2>Một bước nhỏ, riêng tư hơn.</h2><p>Kéo thả hình ảnh vào đây<br>hoặc chọn ảnh từ thiết bị của bạn.</p><button class="button primary" id="choose-image">${icon("plus")} Chọn hình ảnh</button><span class="small muted">PNG, JPG, WebP · Tối đa 10 MB / 20 MP</span><div class="dropzone-separator"><span>hoặc bắt đầu với</span></div><div class="actions"><button class="button secondary" id="demo-image">${icon("image")} Ảnh mẫu demo</button><button class="button secondary" id="open-camera">${icon("camera")} Camera</button></div></div>
      <input id="image-input" type="file" accept="image/png,image/jpeg,image/webp" hidden>
      <input id="camera-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden>
      <div id="editor" hidden><div class="editor-toolbar"><div class="segmented"><button id="view-before" class="active" aria-pressed="true">Ảnh gốc</button><button id="view-after" disabled aria-pressed="false">Sau khi che</button></div><button class="button secondary small-button" id="replace-image">${icon("upload")} Đổi ảnh</button></div><div class="canvas-stage"><canvas id="preview-canvas" aria-label="Ảnh xem trước. Bật đánh dấu và kéo để chọn vùng; hoặc nhập tọa độ bên dưới."></canvas></div><div class="canvas-meta"><span id="image-meta"></span><span id="view-label">Ảnh gốc</span></div><div class="manual-tools"><button id="toggle-draw" class="button secondary small-button" aria-pressed="false">${icon("plus")} Đánh dấu vùng</button><button id="start-scan" class="button secondary small-button">${icon("scan")} Kiểm tra ảnh</button><span class="small muted" id="draw-hint">Chọn vùng riêng tư để che.</span></div>
      <details class="coordinates"><summary>Đánh dấu bằng tọa độ (pixel)</summary><form id="coordinate-form"><label>X<input name="x" type="number" min="0" required value="0"></label><label>Y<input name="y" type="number" min="0" required value="0"></label><label>Rộng<input name="width" type="number" min="1" required></label><label>Cao<input name="height" type="number" min="1" required></label><button type="submit" class="button secondary small-button">Thêm vùng</button></form></details></div>
      <div id="scan-progress" class="scan-progress" role="status" hidden><div class="row-between"><span id="progress-label">Đang chuẩn bị…</span><span id="progress-number"></span></div><progress id="progress-bar" max="100" aria-label="Tiến trình kiểm tra"></progress></div><p id="scanner-error" class="error-text" role="alert"></p><p id="scan-warnings" class="small muted" role="status"></p>
      <div class="workspace-footer">${icon("lock")} OCR tại Python backend · ảnh và kết quả không được cache.</div></section>
      <aside class="panel findings-panel"><div class="section-title"><h2>Vùng cần kiểm tra <span id="finding-count" class="count">0</span></h2>${icon("scan")}</div><div id="result-status" class="result-status">Chưa có ảnh</div><div id="selection-tools" class="selection-tools" hidden><button id="select-all" class="text-button">Chọn tất cả</button><button id="deselect-all" class="text-button">Bỏ chọn</button></div><div id="findings-list" class="findings-list"></div><div class="redaction-actions"><p id="selection-summary" class="small muted">Chọn ảnh để bắt đầu kiểm tra.</p><button id="redact-selected" class="button primary full-width" disabled>${icon("eyeOff")} Che vùng đã chọn</button><button id="download-image" class="button secondary full-width" disabled>${icon("download")} Tải ảnh PNG</button></div><p class="small muted findings-warning">${icon("info")} Kết quả tự động có thể bỏ sót thông tin. Luôn kiểm tra toàn bộ ảnh trước khi chia sẻ.</p></aside></div>
    <div class="scanner-tip">${icon("shield")} <span><strong>Quyền kiểm soát thuộc về bạn.</strong> Chỉ ảnh bạn chủ động chọn mới được mở trong ứng dụng.</span></div>
    <dialog id="camera-dialog" class="camera-dialog"><div class="section-title"><h2>Chụp ảnh để kiểm tra</h2><button id="close-camera" class="icon-button" aria-label="Đóng camera">${icon("x")}</button></div><video id="camera-video" autoplay playsinline muted></video><p id="camera-error" role="alert" class="error-text"></p><div class="actions"><button id="capture-photo" class="button primary" disabled>${icon("camera")} Chụp ảnh</button><button id="native-camera" class="button secondary">Dùng camera thiết bị</button></div><p class="small muted">Camera chỉ hoạt động khi cửa sổ này đang mở.</p></dialog>`;
  const $ = (selector) => main.querySelector(selector);
  const preview = $("#preview-canvas");
  function setError(message = "") {
    $("#scanner-error").textContent = message;
    if (message) toast(message, true);
  }
  function invalidateRedaction() {
    redacted = null;
    view = "before";
    $("#view-after").disabled = true;
    $("#download-image").disabled = true;
  }
  function paint(tempBox) {
    if (!original) return;
    preview.width = original.width;
    preview.height = original.height;
    const ctx = preview.getContext("2d");
    ctx.drawImage(view === "after" && redacted ? redacted : original, 0, 0);
    if (view === "before") {
      const scale =
        original.width /
        (preview.getBoundingClientRect().width || original.width);
      for (const finding of findings) {
        const { x, y, width, height } = finding.box;
        ctx.strokeStyle = selected.has(finding.id) ? "#099c83" : "#d49021";
        ctx.fillStyle = selected.has(finding.id)
          ? "rgba(12,190,153,.12)"
          : "rgba(240,160,40,.08)";
        ctx.lineWidth = 2 * scale;
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
      }
      if (tempBox) {
        ctx.strokeStyle = "#16c9ae";
        ctx.lineWidth = 2 * scale;
        ctx.setLineDash([6 * scale, 4 * scale]);
        ctx.strokeRect(tempBox.x, tempBox.y, tempBox.width, tempBox.height);
      }
    }
    $("#view-before").classList.toggle("active", view === "before");
    $("#view-before").setAttribute("aria-pressed", String(view === "before"));
    $("#view-after").classList.toggle("active", view === "after");
    $("#view-after").setAttribute("aria-pressed", String(view === "after"));
    $("#view-label").textContent =
      view === "after" ? "Ảnh đã che" : "Ảnh gốc · vùng đánh dấu";
  }
  function renderFindings() {
    $("#finding-count").textContent = findings.length;
    $("#selection-tools").hidden = !findings.length;
    $("#findings-list").innerHTML = findings.length
      ? findings
          .map(
            (f) =>
              `<div class="finding-row"><label><input type="checkbox" data-finding="${escapeHTML(f.id)}" ${selected.has(f.id) ? "checked" : ""}><span class="finding-info"><strong>${escapeHTML(f.label)}</strong><span>${escapeHTML(f.text)}</span><small>${f.type === "manual" ? "Đánh dấu thủ công" : fixtureId ? "Dữ liệu mẫu cố định" : `OCR: ${Math.round(f.ocr_confidence * 100)}% · Điểm luật: ${f.score.toFixed(2)}`}</small></span></label><span class="risk ${f.risk}">${{ high: "Cao", medium: "Vừa", low: "Thấp" }[f.risk]}</span>${f.type === "manual" ? `<button class="icon-button" data-remove="${escapeHTML(f.id)}" aria-label="Xóa ${escapeHTML(f.label)}">${icon("x")}</button>` : ""}</div>`,
          )
          .join("")
      : `<div class="empty-findings">${icon(original ? "eye" : "scan")}<h3>${original ? "Chưa có vùng đánh dấu" : "Chưa có kết quả"}</h3><p>${original ? "Bạn có thể kéo để đánh dấu hoặc nhập tọa độ vùng cần che." : "Kết quả sẽ xuất hiện tại đây sau khi bạn chọn ảnh."}</p></div>`;
    $("#selection-summary").textContent = original
      ? `${selected.size}/${findings.length} vùng được chọn để che.`
      : "Chọn ảnh để bắt đầu kiểm tra.";
    $("#redact-selected").disabled = !selected.size || busy;
    $("#download-image").disabled = !redacted || busy;
    $("#toggle-draw").disabled = busy;
    $("#coordinate-form")
      .querySelectorAll("input,button")
      .forEach((el) => (el.disabled = busy));
    $("#start-scan").disabled = busy || !original;
    paint();
  }
  function setBusy(value) {
    busy = value;
    $("#scan-progress").hidden = !value;
    if (value) {
      $("#progress-bar").removeAttribute("value");
      $("#progress-number").textContent = "";
    }
    renderFindings();
  }
  async function runScan() {
    if (!original || busy) return;
    controller?.abort();
    controller = new AbortController();
    const localController = controller;
    setError();
    $("#scan-warnings").textContent = "";
    findings = findings.filter((f) => f.type === "manual");
    selected = new Set(
      [...selected].filter((id) => findings.some((f) => f.id === id)),
    );
    invalidateRedaction();
    setBusy(true);
    $("#result-status").textContent = fixtureId
      ? "Đang mô phỏng trên ảnh mẫu…"
      : "Đang nhận diện văn bản…";
    try {
      const result = await scanImage(original, getDetectionConfig(), {
        fixtureId,
        signal: localController.signal,
        onProgress: (percent, label) => {
          if (disposed || localController.signal.aborted) return;
          if (percent === null) $("#progress-bar").removeAttribute("value");
          else $("#progress-bar").value = percent;
          $("#progress-number").textContent =
            percent === null ? "Đang xử lý" : `${percent}%`;
          $("#progress-label").textContent = fixtureId
            ? "Mô phỏng kiểm tra tài liệu mẫu…"
            : label || "Đang nhận diện văn bản…";
        },
      });
      if (disposed || localController.signal.aborted) return;
      const manual = findings.filter((f) => f.type === "manual");
      findings = [...result.findings, ...manual];
      selected = new Set(findings.map((f) => f.id));
      invalidateRedaction();
      $("#result-status").textContent =
        result.status === "demo"
          ? `Ảnh mẫu · ${result.findings.length} vùng mô phỏng theo cấu hình`
          : result.findings.length
            ? `OCR hoàn tất · ${result.findings.length} vùng tự động · ${result.language}`
            : result.message;
      $("#scan-warnings").textContent = [
        ...(result.warnings || []),
        ...(fixtureId
          ? []
          : [
              "Điểm luật là đánh giá heuristic, không phải xác suất chính xác tuyệt đối.",
            ]),
      ].join(" ");
    } catch (error) {
      if (
        error.name !== "AbortError" &&
        !disposed &&
        controller === localController
      ) {
        $("#result-status").textContent =
          "Chưa hoàn tất nhận diện · vẫn có thể đánh dấu thủ công";
        setError(error.message);
      }
    } finally {
      if (!disposed && controller === localController) setBusy(false);
    }
  }
  function stopDrawing() {
    drawing = false;
    pointerStart = null;
    preview.classList.remove("drawing");
    $("#toggle-draw").classList.remove("active");
    $("#toggle-draw").setAttribute("aria-pressed", "false");
  }
  function loadCanvas(canvas, name, id = null) {
    controller?.abort();
    busy = false;
    original = canvas;
    fixtureId = id;
    $("#scan-mode").textContent = id
      ? "Mock Mode · Ảnh mẫu cố định"
      : "Real OCR · Python backend";
    $("#scan-warnings").textContent = "";
    findings = [];
    selected.clear();
    invalidateRedaction();
    stopDrawing();
    $("#dropzone").hidden = true;
    $("#editor").hidden = false;
    $("#clear-image").disabled = false;
    $("#scan-progress").hidden = true;
    $("#image-meta").textContent =
      `${name} · ${canvas.width} × ${canvas.height} px`;
    $("#result-status").textContent = id
      ? "Ảnh mẫu · chưa kiểm tra"
      : "Ảnh của bạn · chưa nhận diện";
    for (const field of ["x", "width"])
      $("#coordinate-form").elements[field].max = canvas.width;
    for (const field of ["y", "height"])
      $("#coordinate-form").elements[field].max = canvas.height;
    setError();
    renderFindings();
    if (getDetectionConfig().mode === "auto") runScan();
  }
  async function importFile(file) {
    if (!file) return;
    const token = ++generation;
    setError();
    try {
      const canvas = await decodeImage(file);
      if (!disposed && token === generation) loadCanvas(canvas, file.name);
    } catch (error) {
      if (!disposed && token === generation) setError(error.message);
    } finally {
      if (!disposed) {
        $("#image-input").value = "";
        $("#camera-input").value = "";
      }
    }
  }
  function clearImage() {
    generation++;
    controller?.abort();
    original = null;
    redacted = null;
    fixtureId = null;
    findings = [];
    selected.clear();
    busy = false;
    stopDrawing();
    preview.width = 1;
    preview.height = 1;
    $("#dropzone").hidden = false;
    $("#editor").hidden = true;
    $("#scan-progress").hidden = true;
    $("#clear-image").disabled = true;
    $("#result-status").textContent = "Chưa có ảnh";
    $("#scan-warnings").textContent = "";
    $("#scan-mode").textContent = "OCR · Python backend";
    setError();
    renderFindings();
    toast("Đã xóa ảnh và kết quả khỏi phiên quét.");
  }
  function addManual(box) {
    if (!original || busy) return;
    const { x, y, width, height } = box;
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width < 1 ||
      height < 1 ||
      x + width > original.width ||
      y + height > original.height
    ) {
      setError(
        "Tọa độ phải nằm trong ảnh và vùng chọn phải có kích thước lớn hơn 0.",
      );
      return;
    }
    const id = crypto.randomUUID();
    findings.push({
      id,
      type: "manual",
      label: `Vùng thủ công ${findings.filter((f) => f.type === "manual").length + 1}`,
      text: `${Math.round(width)} × ${Math.round(height)} px`,
      risk: "high",
      box,
    });
    selected.add(id);
    invalidateRedaction();
    setError();
    renderFindings();
  }
  function point(event) {
    const rect = preview.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          original.width,
          ((event.clientX - rect.left) * original.width) / rect.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          original.height,
          ((event.clientY - rect.top) * original.height) / rect.height,
        ),
      ),
    };
  }
  function boxTo(a, b) {
    const x = Math.floor(Math.min(a.x, b.x)),
      y = Math.floor(Math.min(a.y, b.y));
    return {
      x,
      y,
      width: Math.ceil(Math.max(a.x, b.x)) - x,
      height: Math.ceil(Math.max(a.y, b.y)) - y,
    };
  }
  preview.addEventListener("pointerdown", (event) => {
    if (!drawing || busy || view !== "before") return;
    event.preventDefault();
    preview.setPointerCapture(event.pointerId);
    pointerStart = point(event);
  });
  preview.addEventListener("pointermove", (event) => {
    if (pointerStart && drawing) paint(boxTo(pointerStart, point(event)));
  });
  preview.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const box = boxTo(pointerStart, point(event));
    pointerStart = null;
    if (box.width >= 3 && box.height >= 3) addManual(box);
    else paint();
  });
  preview.addEventListener("pointercancel", () => {
    pointerStart = null;
    paint();
  });
  $("#coordinate-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    addManual(
      Object.fromEntries(
        ["x", "y", "width", "height"].map((key) => [
          key,
          Number(data.get(key)),
        ]),
      ),
    );
  });
  $("#choose-image").onclick = () => $("#image-input").click();
  $("#replace-image").onclick = () => $("#image-input").click();
  $("#image-input").onchange = (event) => importFile(event.target.files[0]);
  $("#camera-input").onchange = (event) => importFile(event.target.files[0]);
  $("#demo-image").onclick = () => {
    generation++;
    loadCanvas(createDemoCanvas(), "Tài liệu mẫu ScreenGuard+", DEMO_ID);
  };
  $("#clear-image").onclick = clearImage;
  $("#start-scan").onclick = runScan;
  $("#toggle-draw").onclick = () => {
    drawing = !drawing;
    view = "before";
    preview.classList.toggle("drawing", drawing);
    $("#toggle-draw").classList.toggle("active", drawing);
    $("#toggle-draw").setAttribute("aria-pressed", String(drawing));
    $("#draw-hint").textContent = drawing
      ? "Kéo trên ảnh để tạo vùng cần che."
      : "Chọn vùng riêng tư để che.";
    paint();
  };
  $("#view-before").onclick = () => {
    view = "before";
    paint();
  };
  $("#view-after").onclick = () => {
    if (redacted) {
      view = "after";
      stopDrawing();
      paint();
    }
  };
  $("#select-all").onclick = () => {
    selected = new Set(findings.map((f) => f.id));
    invalidateRedaction();
    renderFindings();
  };
  $("#deselect-all").onclick = () => {
    selected.clear();
    invalidateRedaction();
    renderFindings();
  };
  $("#findings-list").addEventListener("change", (event) => {
    if (event.target.dataset.finding) {
      const id = event.target.dataset.finding;
      event.target.checked ? selected.add(id) : selected.delete(id);
      invalidateRedaction();
      renderFindings();
    }
  });
  $("#findings-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (button) {
      findings = findings.filter((f) => f.id !== button.dataset.remove);
      selected.delete(button.dataset.remove);
      invalidateRedaction();
      renderFindings();
    }
  });
  $("#redact-selected").onclick = () => {
    try {
      redacted = redactImage(
        original,
        findings.filter((f) => selected.has(f.id)),
      );
      view = "after";
      stopDrawing();
      $("#view-after").disabled = false;
      renderFindings();
      toast(`Đã che ${selected.size} vùng. Hãy xem lại ảnh trước khi tải.`);
    } catch (error) {
      setError(error.message);
    }
  };
  $("#download-image").onclick = () => {
    if (!redacted) return;
    redacted.toBlob((blob) => {
      if (!blob) {
        setError("Không thể xuất ảnh. Vui lòng thử lại.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "screenguard-protected.png";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };
  const preventDrop = (event) => event.preventDefault();
  main.addEventListener("dragover", preventDrop);
  const onDrop = (event) => {
    event.preventDefault();
    $("#dropzone").classList.remove("drag-over");
    importFile(event.dataTransfer?.files[0]);
  };
  main.addEventListener("drop", onDrop);
  $("#dropzone").addEventListener("dragenter", () =>
    $("#dropzone").classList.add("drag-over"),
  );
  $("#dropzone").addEventListener("dragleave", () =>
    $("#dropzone").classList.remove("drag-over"),
  );
  const dialog = $("#camera-dialog"),
    videoElement = $("#camera-video"),
    captureButton = $("#capture-photo");
  function stopCamera() {
    cameraGeneration++;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    videoElement.srcObject = null;
    captureButton.disabled = true;
  }
  dialog.addEventListener("close", stopCamera);
  function closeCamera() {
    stopCamera();
    dialog.close();
  }
  $("#close-camera").onclick = closeCamera;
  $("#open-camera").onclick = async () => {
    stopCamera();
    const requestGeneration = cameraGeneration;
    dialog.showModal();
    $("#camera-error").textContent = "";
    if (!navigator.mediaDevices?.getUserMedia) {
      $("#camera-error").textContent =
        "Camera trực tiếp cần HTTPS hoặc localhost và trình duyệt hỗ trợ. Bạn có thể dùng camera thiết bị bên dưới.";
      return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1600 } },
        audio: false,
      });
      if (disposed || !dialog.open || requestGeneration !== cameraGeneration) {
        nextStream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = nextStream;
      videoElement.srcObject = stream;
      await videoElement.play();
      if (!disposed && dialog.open && requestGeneration === cameraGeneration)
        captureButton.disabled = false;
    } catch (error) {
      if (!disposed && dialog.open && requestGeneration === cameraGeneration) {
        $("#camera-error").textContent =
          error.name === "NotAllowedError"
            ? "Quyền camera bị từ chối. Bạn có thể chọn ảnh hoặc dùng camera thiết bị."
            : "Không mở được camera. Hãy kiểm tra thiết bị hoặc chọn ảnh có sẵn.";
        stopCamera();
      }
    }
  };
  $("#native-camera").onclick = () => {
    closeCamera();
    $("#camera-input").click();
  };
  $("#capture-photo").onclick = () => {
    const video = $("#camera-video");
    if (!video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    closeCamera();
    generation++;
    loadCanvas(canvas, "Ảnh chụp camera");
  };
  const resize = new ResizeObserver(() => paint());
  resize.observe(preview);
  // Only rerender on CSS size changes: resizing backing pixels can trigger observers in some engines.
  renderFindings();
  if (location.hash.includes("?demo")) {
    loadCanvas(createDemoCanvas(), "Tài liệu mẫu ScreenGuard+", DEMO_ID);
  }
  return () => {
    disposed = true;
    main.removeEventListener("dragover", preventDrop);
    main.removeEventListener("drop", onDrop);
    generation++;
    controller?.abort();
    stopCamera();
    if (dialog.open) dialog.close();
    resize.disconnect();
    original = null;
    redacted = null;
    findings = [];
    selected.clear();
    preview.width = 1;
    preview.height = 1;
  };
}
