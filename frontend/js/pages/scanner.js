import { icon } from "../components/icons.js";
import { escapeHTML, toast } from "../components/ui.js";
import { scannerView } from "../components/scanner-view.js";
import { getDetectionConfig } from "../services/config-service.js";
import { createDemoCanvas, DEMO_ID } from "../services/mock-scanner.js";
import { loadDesktopReview } from "../services/desktop-service.js";
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
    cameraGeneration = 0,
    activeFinding = null;
  main.innerHTML = scannerView();
  const $ = (selector) => main.querySelector(selector);
  // A loading state above the preview remains visible on compact screens.
  $(".scanner-workspace").prepend($("#scan-progress"));
  main.dataset.mobilePanel = "image";
  $(".scanner-workspace").id = "scan-image-panel";
  $(".findings-panel").id = "scan-findings-panel";
  function setMobilePanel(panel) {
    main.dataset.mobilePanel = panel;
    for (const name of ["image", "findings"]) {
      const button = $(`#mobile-${name}-tab`);
      button.classList.toggle("active", panel === name);
      button.setAttribute("aria-selected", String(panel === name));
      button.tabIndex = panel === name ? 0 : -1;
    }
  }
  $("#mobile-image-tab").onclick = () => setMobilePanel("image");
  $("#mobile-findings-tab").onclick = () => setMobilePanel("findings");
  $(".mobile-scan-tabs").onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const panel =
      event.key === "Home"
        ? "image"
        : event.key === "End"
          ? "findings"
          : main.dataset.mobilePanel === "image"
            ? "findings"
            : "image";
    setMobilePanel(panel);
    $(`#mobile-${panel}-tab`).focus();
  };
  setMobilePanel("image");
  const preview = $("#preview-canvas");
  const detailCanvas = $("#detail-canvas");
  const detailDialog = $("#image-detail-dialog");
  detailDialog.addEventListener("close", () => {
    detailCanvas.width = detailCanvas.height = 1;
  });
  function setError(message = "") {
    $("#scanner-error").textContent = message;
    $("#scan-recovery").hidden = !message || !original;
    if (message) toast(message, true);
    if (message) main.dataset.scanState = "error";
  }
  function invalidateRedaction() {
    redacted = null;
    view = "before";
    $("#view-after").disabled = true;
    $("#download-image").disabled = true;
  }
  function paint(tempBox) {
    if (!original) return;
    for (const canvas of detailDialog.open
      ? [preview, detailCanvas]
      : [preview]) {
      canvas.width = original.width;
      canvas.height = original.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(view === "after" && redacted ? redacted : original, 0, 0);
      if (view === "before") {
        const scale =
          original.width /
          (canvas.getBoundingClientRect().width || original.width);
        for (const finding of findings) {
          const { x, y, width, height } = finding.box;
          const active = finding.id === activeFinding;
          ctx.strokeStyle = active
            ? "#0875dc"
            : selected.has(finding.id)
              ? "#099c83"
              : "#d49021";
          ctx.fillStyle = active
            ? "rgba(8,117,220,.20)"
            : selected.has(finding.id)
              ? "rgba(12,190,153,.12)"
              : "rgba(240,160,40,.08)";
          ctx.lineWidth = (active ? 3.5 : 2) * scale;
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
    }
    $("#view-before").classList.toggle("active", view === "before");
    $("#view-before").setAttribute("aria-pressed", String(view === "before"));
    $("#view-after").classList.toggle("active", view === "after");
    $("#view-after").setAttribute("aria-pressed", String(view === "after"));
    $("#view-label").textContent =
      view === "after"
        ? `Đã che ${selected.size} vùng`
        : "Ảnh gốc · nhấn vùng để chọn";
    preview.dataset.activeFinding = activeFinding || "";
  }
  function renderFindings() {
    const focusedCheckbox = document.activeElement?.dataset.finding;
    $("#finding-count").textContent = findings.length;
    $("#finding-title").textContent = findings.length
      ? `Phát hiện ${findings.length} vùng`
      : "Vùng cần kiểm tra";
    $("#mobile-finding-count").textContent = findings.length;
    $("#selection-tools").hidden = !findings.length;
    $("#findings-list").innerHTML = findings.length
      ? findings
          .map(
            (f) =>
              `<div class="finding-row ${activeFinding === f.id ? "is-active" : ""} ${f.type === "manual" ? "has-remove" : ""}" data-row="${escapeHTML(f.id)}"><input type="checkbox" data-finding="${escapeHTML(f.id)}" aria-label="Che ${escapeHTML(f.label)} ${escapeHTML(f.text)}" ${selected.has(f.id) ? "checked" : ""}><button class="finding-focus" data-focus="${escapeHTML(f.id)}" aria-label="Xem vùng ${escapeHTML(f.label)}"><span class="finding-info"><strong>${f.risk === "high" ? '<i class="risk-dot" aria-label="Rủi ro cao"></i>' : ""}${escapeHTML(f.label)}</strong><span>${escapeHTML(f.text)}</span>${!fixtureId && f.type !== "manual" && f.ocr_confidence < 0.6 ? '<small class="review-flag">Cần kiểm tra</small>' : ""}</span></button>${f.type === "manual" ? `<button class="icon-button remove-finding" data-remove="${escapeHTML(f.id)}" aria-label="Xóa ${escapeHTML(f.label)}">${icon("x")}</button>` : `<details class="finding-details"><summary aria-label="Chi tiết ${escapeHTML(f.label)}">${icon("chevron")}</summary><dl><div><dt>Độ tin cậy OCR</dt><dd>${fixtureId ? "Mô phỏng" : `${Math.round(f.ocr_confidence * 100)}%`}</dd></div><div><dt>Điểm luật</dt><dd>${Number.isFinite(f.score) ? escapeHTML(String(f.score)) : "—"}</dd></div><div><dt>Rủi ro</dt><dd>${{ high: "Cao", medium: "Vừa", low: "Thấp" }[f.risk] || "—"}</dd></div></dl></details>`}</div>`,
          )
          .join("")
      : `<div class="empty-findings">${icon(original ? "eye" : "scan")}<h3>${original ? "Chưa có vùng đánh dấu" : "Chưa có kết quả"}</h3><p>${original ? "Tự đánh dấu thêm trên ảnh." : "Chọn một ảnh để bắt đầu."}</p></div>`;
    $("#selection-summary").textContent = original
      ? redacted
        ? `Đã che ${selected.size} vùng. Xem lại trước khi tải.`
        : `${selected.size}/${findings.length} vùng được chọn để che.`
      : "Chọn ảnh để bắt đầu kiểm tra.";
    $("#redact-selected").textContent = `Che ${selected.size} vùng`;
    $("#redact-selected").hidden = !!redacted;
    $("#download-image").hidden = !redacted;
    $("#edit-redaction").hidden = !redacted;
    $("#redact-selected").disabled = !selected.size || busy;
    $("#download-image").disabled = !redacted || busy;
    $("#toggle-draw").disabled = busy;
    $("#coordinate-form")
      .querySelectorAll("input,button")
      .forEach((el) => (el.disabled = busy));
    $("#start-scan").disabled = busy || !original;
    $("#retry-scan").disabled = busy;
    $("#error-manual").disabled = busy;
    if (focusedCheckbox)
      $("#findings-list")
        .querySelector(`[data-finding="${CSS.escape(focusedCheckbox)}"]`)
        ?.focus({ preventScroll: true });
    paint();
  }
  function setBusy(value) {
    busy = value;
    $("#scan-progress").hidden = !value;
    $(".scanner-workspace").setAttribute("aria-busy", String(value));
    main.dataset.scanState = value
      ? "loading"
      : $("#scanner-error").textContent
        ? "error"
        : original
          ? findings.length
            ? "success"
            : "empty-result"
          : "empty";
    if (value) {
      $("#progress-bar").removeAttribute("value");
      $("#progress-number").textContent = "";
      $("#progress-label").textContent = "Đang kiểm tra ảnh...";
    }
    renderFindings();
  }
  async function runScan() {
    if (!original || busy) return;
    stopDrawing();
    $("#image-menu").open = false;
    controller?.abort();
    controller = new AbortController();
    const localController = controller;
    const scanGeneration = generation;
    setError();
    $("#scan-warnings").textContent = "";
    findings = findings.filter((f) => f.type === "manual");
    if (!findings.some((f) => f.id === activeFinding)) activeFinding = null;
    selected = new Set(
      [...selected].filter((id) => findings.some((f) => f.id === id)),
    );
    invalidateRedaction();
    setBusy(true);
    $("#result-status").textContent = fixtureId
      ? "Đang mô phỏng trên ảnh mẫu…"
      : "Đang kiểm tra thông tin nhạy cảm…";
    try {
      const result = await scanImage(original, getDetectionConfig(), {
        fixtureId,
        signal: localController.signal,
        onProgress: (percent, label) => {
          if (
            disposed ||
            localController.signal.aborted ||
            scanGeneration !== generation
          )
            return;
          $("#progress-bar").removeAttribute("value");
          $("#progress-number").textContent = fixtureId
            ? "Đang kiểm tra ảnh mẫu mô phỏng…"
            : label || "Đang đọc văn bản trong ảnh…";
        },
      });
      if (
        disposed ||
        localController.signal.aborted ||
        scanGeneration !== generation
      )
        return;
      const manual = findings.filter((f) => f.type === "manual");
      findings = [...result.findings, ...manual];
      selected = new Set(findings.map((f) => f.id));
      invalidateRedaction();
      $("#result-status").textContent =
        result.status === "demo"
          ? `Ảnh mẫu · ${result.findings.length} vùng mô phỏng theo cấu hình`
          : result.findings.length
            ? `Phát hiện ${result.findings.length} thông tin có thể nhạy cảm`
            : result.message;
      $("#scan-warnings").textContent = (result.warnings || []).join(" ");
    } catch (error) {
      if (
        error.name !== "AbortError" &&
        !disposed &&
        controller === localController &&
        scanGeneration === generation
      ) {
        $("#result-status").textContent =
          "Chưa kiểm tra xong. Hãy thử lại hoặc đánh dấu thủ công.";
        setMobilePanel("image");
        setError(error.message);
      }
    } finally {
      if (
        !disposed &&
        controller === localController &&
        scanGeneration === generation
      )
        setBusy(false);
    }
  }
  function stopDrawing() {
    drawing = false;
    pointerStart = null;
    preview.classList.remove("drawing");
    preview.style.cursor = "";
    $("#toggle-draw").classList.remove("active");
    $("#toggle-draw").setAttribute("aria-pressed", "false");
  }
  function loadCanvas(canvas, name, id = null, scanned = null) {
    controller?.abort();
    busy = false;
    original = canvas;
    fixtureId = id;
    activeFinding = null;
    $("#advanced-tools").open = false;
    $("#image-menu").open = false;
    main.classList.add("has-image");
    setMobilePanel("image");
    $("#scan-mode").textContent = id ? "Ảnh mẫu · Mô phỏng" : "Tự động";
    $("#scan-mode").hidden = !id;
    $("#scan-warnings").textContent = "";
    findings = [];
    selected.clear();
    invalidateRedaction();
    stopDrawing();
    $("#dropzone").hidden = true;
    $("#editor").hidden = false;
    $("#clear-image").disabled = false;
    $("#scan-progress").hidden = true;
    $("#image-meta").textContent = name;
    $("#image-meta").title = `${canvas.width} × ${canvas.height} px`;
    $("#result-status").textContent = id
      ? "Ảnh mẫu · chưa kiểm tra"
      : "Ảnh của bạn · chưa nhận diện";
    for (const field of ["x", "width"])
      $("#coordinate-form").elements[field].max = canvas.width;
    for (const field of ["y", "height"])
      $("#coordinate-form").elements[field].max = canvas.height;
    setError();
    renderFindings();
    if (scanned) {
      findings = scanned.findings;
      selected = new Set(findings.map((f) => f.id));
      $("#result-status").textContent = scanned.message;
      $("#scan-warnings").textContent = (scanned.warnings || []).join(" ");
      setBusy(false);
    } else runScan();
  }
  async function importFile(file) {
    if (!file) return;
    const token = ++generation;
    controller?.abort();
    controller = null;
    findings = [];
    selected.clear();
    activeFinding = null;
    invalidateRedaction();
    stopDrawing();
    setError();
    setBusy(true);
    $("#progress-number").textContent = "Đang mở ảnh…";
    $("#result-status").textContent = "Đang mở ảnh mới…";
    try {
      const canvas = await decodeImage(file);
      if (!disposed && token === generation) loadCanvas(canvas, file.name);
    } catch (error) {
      if (!disposed && token === generation) {
        setBusy(false);
        $("#result-status").textContent =
          "Không mở được ảnh. Hãy chọn lại hoặc đánh dấu thủ công.";
        setError(error.message);
      }
    } finally {
      if (!disposed) {
        $("#image-input").value = "";
        $("#camera-input").value = "";
      }
    }
  }
  function clearImage() {
    main.classList.remove("has-image");
    setMobilePanel("image");
    generation++;
    controller?.abort();
    original = null;
    activeFinding = null;
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
    $("#scan-mode").textContent = "Tự động";
    $("#scan-mode").hidden = true;
    detailDialog.close();
    detailCanvas.width = detailCanvas.height = 1;
    $(".scanner-workspace").setAttribute("aria-busy", "false");
    main.dataset.scanState = "empty";
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
    activeFinding = id;
    invalidateRedaction();
    setError();
    renderFindings();
  }
  function point(event) {
    const rect = (
      event.currentTarget === detailCanvas ? detailCanvas : preview
    ).getBoundingClientRect();
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
  function activateFinding(id, { reveal = false } = {}) {
    if (!findings.some((f) => f.id === id)) return;
    activeFinding = id;
    if (reveal) {
      view = "before";
      stopDrawing();
      setMobilePanel("image");
    }
    $("#findings-list")
      .querySelectorAll("[data-row]")
      .forEach((row) =>
        row.classList.toggle("is-active", row.dataset.row === id),
      );
    paint();
  }
  function hitFinding(event) {
    if (!original || view !== "before") return null;
    const { x, y } = point(event);
    return findings
      .filter(
        (f) =>
          x >= f.box.x &&
          x <= f.box.x + f.box.width &&
          y >= f.box.y &&
          y <= f.box.y + f.box.height,
      )
      .sort(
        (a, b) => a.box.width * a.box.height - b.box.width * b.box.height,
      )[0];
  }
  preview.addEventListener("pointerdown", (event) => {
    if (!drawing || busy || view !== "before") return;
    event.preventDefault();
    preview.setPointerCapture(event.pointerId);
    pointerStart = point(event);
  });
  preview.addEventListener("pointermove", (event) => {
    if (pointerStart && drawing) paint(boxTo(pointerStart, point(event)));
    else if (!drawing && !busy) {
      const hit = hitFinding(event);
      preview.style.cursor = hit ? "pointer" : "";
      if (hit && hit.id !== activeFinding) activateFinding(hit.id);
    }
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
  preview.addEventListener("click", (event) => {
    if (drawing || busy || view !== "before") return;
    const hit = hitFinding(event);
    if (!hit) return;
    activeFinding = hit.id;
    selected.has(hit.id) ? selected.delete(hit.id) : selected.add(hit.id);
    invalidateRedaction();
    renderFindings();
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
    loadCanvas(createDemoCanvas(), "Ảnh mẫu ScreenGuard+");
  };
  $("#zoom-image").onclick = () => {
    if (!original) return;
    detailDialog.showModal();
    paint();
  };
  $("#close-image-detail").onclick = () => detailDialog.close();
  detailCanvas.addEventListener("click", (event) => {
    if (busy) return;
    const hit = hitFinding(event);
    if (!hit) return;
    activeFinding = hit.id;
    selected.has(hit.id) ? selected.delete(hit.id) : selected.add(hit.id);
    invalidateRedaction();
    renderFindings();
  });
  $("#edit-redaction").onclick = () => {
    invalidateRedaction();
    renderFindings();
    $("#redact-selected").focus();
  };
  $("#clear-image").onclick = clearImage;
  $("#start-scan").onclick = runScan;
  $("#retry-scan").onclick = runScan;
  function openManual() {
    if (!original || busy) return;
    $("#image-menu").open = false;
    $("#advanced-tools").open = true;
    setMobilePanel("image");
    if (!drawing) $("#toggle-draw").click();
    preview.focus({ preventScroll: true });
  }
  $("#open-manual").onclick = openManual;
  $("#error-manual").onclick = openManual;
  $("#toggle-draw").onclick = () => {
    drawing = !drawing;
    preview.style.cursor = "";
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
      activeFinding = id;
      invalidateRedaction();
      renderFindings();
    }
  });
  $("#findings-list").addEventListener("click", (event) => {
    const focusButton = event.target.closest("[data-focus]");
    if (focusButton) {
      activateFinding(focusButton.dataset.focus, { reveal: true });
      return;
    }
    const button = event.target.closest("[data-remove]");
    if (button) {
      findings = findings.filter((f) => f.id !== button.dataset.remove);
      selected.delete(button.dataset.remove);
      if (activeFinding === button.dataset.remove) activeFinding = null;
      invalidateRedaction();
      renderFindings();
    }
  });
  $("#findings-list").addEventListener("pointerover", (event) => {
    const row = event.target.closest("[data-row]");
    if (row && row.dataset.row !== activeFinding)
      activateFinding(row.dataset.row);
  });
  $("#findings-list").addEventListener("focusin", (event) => {
    const row = event.target.closest("[data-row]");
    if (row) activateFinding(row.dataset.row);
  });
  $("#redact-selected").onclick = () => {
    try {
      redacted = redactImage(
        original,
        findings.filter((f) => selected.has(f.id)),
      );
      view = "after";
      setMobilePanel("image");
      stopDrawing();
      $("#view-after").disabled = false;
      renderFindings();
      $("#download-image").focus({ preventScroll: true });
    } catch (error) {
      setError(error.message);
    }
  };
  $("#download-image").onclick = () => {
    if (!redacted || busy) return;
    const exportCanvas = redacted,
      exportGeneration = generation;
    exportCanvas.toBlob((blob) => {
      if (
        disposed ||
        exportGeneration !== generation ||
        exportCanvas !== redacted ||
        busy
      )
        return;
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
  const reviewId = new URLSearchParams(location.hash.split("?")[1] || "").get(
    "review",
  );
  if (reviewId) {
    const reviewGeneration = ++generation;
    controller = new AbortController();
    const reviewController = controller;
    setBusy(true);
    loadDesktopReview(reviewId, reviewController.signal)
      .then(({ canvas, result }) => {
        if (!disposed && reviewGeneration === generation)
          loadCanvas(canvas, "Screenshot từ Windows", null, result);
      })
      .catch((error) => {
        if (
          !disposed &&
          reviewGeneration === generation &&
          error.name !== "AbortError"
        ) {
          setError(error.message);
          setBusy(false);
        }
      });
    history.replaceState(null, "", "#/scanner");
  } else if (location.hash.includes("?demo")) {
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
    if (detailDialog.open) detailDialog.close();
    detailCanvas.width = detailCanvas.height = 1;
    resize.disconnect();
    original = null;
    redacted = null;
    findings = [];
    selected.clear();
    preview.width = 1;
    preview.height = 1;
  };
}
