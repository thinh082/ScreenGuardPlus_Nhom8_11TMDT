import { icon } from "../components/icons.js";
import { escapeHTML, toast } from "../components/ui.js";
import { scannerView } from "../components/scanner-view.js";
import { createDemoCanvas, DEMO_ID } from "../services/mock-scanner.js";
import { loadDesktopReview } from "../services/desktop-service.js";
import {
  decodeImage,
  scanImage,
  redactImage,
  exportSecureImage,
} from "../services/scanner-service.js";
import {
  getDetectionConfig,
  updateDetectionConfig,
} from "../services/config-service.js";

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
    activeFinding = null,
    scanTicket = null,
    scanProfile = "personal";
  main.innerHTML = scannerView();
  const $ = (selector) => main.querySelector(selector);
  let workflowStep = 1,
    scanComplete = false,
    exportedHash = "";
  let policy = null,
    policyKey = "",
    policySerial = 0,
    policyController;
  let ticketExpired = false;
  let exporting = false;
  const steps = [
    [
      "Tiếp nhận ảnh",
      "Bắt đầu từ một ảnh bạn muốn bảo vệ.",
      "Tiếp: Xem phát hiện",
    ],
    [
      "Phát hiện rủi ro",
      "Kiểm tra những vùng OCR đã tìm thấy.",
      "Tiếp: Đánh giá chính sách",
    ],
    [
      "Đánh giá chính sách",
      "Chọn ngữ cảnh chia sẻ và xem kế hoạch che.",
      "Tiếp: Che thông tin",
    ],
    [
      "Che thông tin",
      "Chọn vùng, che và đối chiếu ảnh gốc.",
      "Tiếp: Kiểm chứng & xuất",
    ],
    ["Kiểm chứng & xuất", "Kiểm tra ảnh đã che trước khi tải PNG.", ""],
  ];
  const reasons = {
    SECRET_REDACTION_REQUIRED: "Bí mật hệ thống phải được che trước khi xuất.",
    CITIZEN_ID_REDACTION_REQUIRED: "Cần che CCCD khi chia sẻ công khai.",
    FINANCIAL_DATA_REDACTION_REQUIRED:
      "Cần che tài khoản ngân hàng khi chia sẻ công khai.",
    SENSITIVE_PII_INTERNAL_WARNING:
      "Còn CCCD hoặc tài khoản ngân hàng chưa che khi chia sẻ nội bộ.",
    INTERNAL_DATA_WARNING: "Còn thông tin cá nhân hoặc mạng nội bộ chưa che.",
    LOW_CONFIDENCE_REVIEW: "Có vùng OCR chưa rõ. Hãy kiểm tra lại.",
    EXPORT_ALLOWED: "Đáp ứng chính sách với các vùng đã phát hiện.",
  };
  // Move existing controls, never recreate the image, canvas or finding state.
  $("#intake-upload").append($("#dropzone"));
  $("#intake-options").append($("#profile-select"));
  $("#profile-select").insertAdjacentHTML(
    "beforebegin",
    '<label for="profile-select">Chế độ bảo vệ</label>',
  );
  $(".workflow-policy").prepend($("#destination-select"));
  $("#destination-select").insertAdjacentHTML(
    "beforebegin",
    '<label for="destination-select">Chia sẻ</label>',
  );
  const recovery = document.createElement("div");
  recovery.className = "workflow-recovery";
  $(".workflow-footer").before(recovery);
  for (const id of [
    "scan-progress",
    "scanner-error",
    "scan-recovery",
    "scan-warnings",
  ])
    recovery.append($(`#${id}`));
  function selectedBoxes() {
    return findings.filter((f) => selected.has(f.id)).map((f) => f.box);
  }
  function resetPolicy() {
    policy = null;
    policyKey = "";
    policySerial++;
    policyController?.abort();
  }
  async function updatePolicy(force = false) {
    if (![3, 5].includes(workflowStep)) return;
    const banner = $("#policy-banner");
    const boxes = workflowStep === 3 || redacted ? selectedBoxes() : [];
    const key = JSON.stringify([
      scanTicket,
      workflowStep,
      $("#destination-select").value,
      boxes,
    ]);
    if (!force && key === policyKey) return;
    policyKey = key;
    policy = null;
    policyController?.abort();
    delete banner.dataset.decision;
    const serial = ++policySerial;
    banner.className = "policy-banner";
    $("#policy-reasons").replaceChildren();
    $("#policy-coverage").textContent = "";
    if (!scanTicket || !scanComplete || fixtureId || ticketExpired) {
      banner.textContent = ticketExpired
        ? "Phiên quét đã hết hạn"
        : "Chưa có phiên OCR hợp lệ";
      $("#policy-coverage").textContent =
        "Quét lại ảnh để backend đánh giá. Không có quyết định giả lập.";
      return;
    }
    banner.textContent = "Đang đánh giá…";
    policyController = new AbortController();
    const pendingController = policyController;
    const timeout = setTimeout(() => pendingController.abort(), 10000);
    try {
      const response = await fetch("./api/policy/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: policyController.signal,
        body: JSON.stringify({
          ticket: scanTicket,
          destination: $("#destination-select").value,
          redactions: boxes.map((b) => ({
            x: Math.round(b.x),
            y: Math.round(b.y),
            width: Math.round(b.width),
            height: Math.round(b.height),
          })),
        }),
      });
      const data = await response.json();
      if (disposed || serial !== policySerial) return;
      if (response.status === 422 && data?.detail?.code === "INVALID_TICKET") {
        ticketExpired = true;
        throw new Error("Phiên quét đã hết hạn. Hãy quét lại ảnh.");
      }
      if (!response.ok || !["BLOCK", "WARN", "ALLOW"].includes(data?.decision))
        throw new Error("Chưa lấy được quyết định từ backend. Hãy thử lại.");
      policy = data;
      banner.dataset.decision = data.decision;
      banner.className = `policy-banner policy-${{ BLOCK: "blocked", WARN: "warning", ALLOW: "allowed" }[data.decision]}`;
      banner.textContent = `${data.decision} · ${{ BLOCK: "Cần che thêm", WARN: "Cần xác nhận", ALLOW: "Đáp ứng chính sách" }[data.decision]}`;
      $("#policy-reasons").innerHTML = data.reasons
        .map(
          (r) =>
            `<li>${escapeHTML(reasons[r] || "Backend yêu cầu kiểm tra bổ sung.")}</li>`,
        )
        .join("");
      $("#policy-coverage").textContent =
        `Còn ${data.unredacted_mandatory_count} vùng bắt buộc · ${data.unredacted_warning_count} cảnh báo`;
    } catch (error) {
      if (!disposed && serial === policySerial) {
        delete banner.dataset.decision;
        banner.textContent = ticketExpired
          ? "Phiên quét đã hết hạn. Hãy quét lại ảnh."
          : "Chưa đánh giá được chính sách";
        $("#policy-coverage").textContent = ticketExpired
          ? "Ảnh và vùng chọn vẫn giữ nguyên trong phiên này."
          : "Kiểm tra backend và chọn Đánh giá lại.";
      }
    } finally {
      clearTimeout(timeout);
      if (!disposed && serial === policySerial) syncWorkflow(false);
    }
  }
  function syncWorkflow(refresh = true) {
    main.dataset.workflowStep = workflowStep;
    $("#workflow-title").textContent = steps[workflowStep - 1][0];
    document.querySelector("#breadcrumb-page").textContent =
      steps[workflowStep - 1][0];
    $("#workflow-description").textContent = steps[workflowStep - 1][1];
    $("#workflow-eyebrow").textContent =
      `BƯỚC ${String(workflowStep).padStart(2, "0")} / 05`;
    $("#workflow-step-select").value = workflowStep;
    $("#workflow-previous").disabled = workflowStep === 1;
    $("#workflow-next").hidden = workflowStep === 5;
    $("#workflow-next").textContent = steps[workflowStep - 1][2];
    $("#workflow-next").disabled =
      !original ||
      busy ||
      (workflowStep === 2 && !scanComplete) ||
      (workflowStep === 4 && !redacted);
    $("#workflow-hint").textContent = !original
      ? "Chọn ảnh để bắt đầu."
      : busy
        ? exporting
          ? "Đang xuất PNG…"
          : "Đang xử lý ảnh…"
        : workflowStep === 3
          ? "Đánh giá kế hoạch, chưa thay đổi ảnh."
          : workflowStep === 5
            ? "OCR có thể bỏ sót. Kiểm tra trước khi chia sẻ."
            : `${selected.size}/${findings.length} vùng được chọn`;
    $("#intake-panel").hidden = workflowStep !== 1;
    $("#received-image").hidden = !original;
    $("#received-name").textContent = $("#image-meta").textContent;
    $("#received-state").textContent = busy
      ? "Đang quét bằng Tesseract…"
      : scanComplete
        ? `OCR hoàn tất · ${findings.length} vùng cần kiểm tra`
        : "Chưa quét xong · có thể đánh dấu thủ công";
    $("#policy-context").textContent =
      workflowStep === 3
        ? "KẾ HOẠCH CHE · CHƯA ÁP DỤNG"
        : "ẢNH XUẤT · CÁC VÙNG ĐÃ CHE";
    $("#download-image").disabled = !redacted || busy || ticketExpired;
    $("#policy-rescan").hidden = !original || (!ticketExpired && !!scanTicket);
    const complete = [
      !!original,
      scanComplete,
      !!policy && !ticketExpired,
      !!redacted,
      !!exportedHash,
    ];
    document
      .querySelectorAll("button[data-workflow-step]")
      .forEach((button) => {
        const n = Number(button.dataset.workflowStep);
        const active = n === workflowStep;
        button.classList.toggle("active", active);
        button.classList.toggle("is-complete", complete[n - 1]);
        button.setAttribute(
          "aria-label",
          `${String(n).padStart(2, "0")} ${steps[n - 1][0]}${complete[n - 1] ? ", đã hoàn thành" : ""}`,
        );
        if (active) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      });
    if (refresh) void updatePolicy();
  }
  function goStep(n, focus = true) {
    if (n < 1 || n > 5) return;
    if (n > 1 && !original) {
      toast("Hãy tiếp nhận ảnh trước.");
      return;
    }
    workflowStep = n;
    if ([3, 5].includes(n)) policyKey = "";
    // Step changes only move the view. No OCR, redaction or export is triggered.
    syncWorkflow();
    if (focus) $("#workflow-title").focus({ preventScroll: true });
    requestAnimationFrame(() => paint());
  }
  const navigate = (event) => goStep(Number(event.detail));
  window.addEventListener("workflow:navigate", navigate);
  $("#workflow-step-select").onchange = (e) => goStep(Number(e.target.value));
  $("#workflow-previous").onclick = () => goStep(workflowStep - 1);
  $("#workflow-next").onclick = () => goStep(workflowStep + 1);
  $("#intake-replace").onclick = () => $("#image-input").click();
  $("#refresh-policy").onclick = () => updatePolicy(true);
  $("#policy-rescan").onclick = () => {
    goStep(2);
    runScan();
  };
  const refreshVisiblePolicy = () => {
    if (!document.hidden) void updatePolicy(true);
  };
  window.addEventListener("focus", refreshVisiblePolicy);
  const policyTimer = setInterval(refreshVisiblePolicy, 60000);
  // A loading state above the preview remains visible on compact screens.
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
    exportedHash = "";
    resetPolicy();
    view = "before";
    const hashEl = $("#export-hash-pill");
    if (hashEl) hashEl.hidden = true;
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
              `<div class="finding-row ${activeFinding === f.id ? "is-active" : ""} ${f.type === "manual" ? "has-remove" : ""}" data-row="${escapeHTML(f.id)}"><input type="checkbox" data-finding="${escapeHTML(f.id)}" aria-label="Che ${escapeHTML(f.label)} ${escapeHTML(f.text)}" ${selected.has(f.id) ? "checked" : ""}><button class="finding-focus" data-focus="${escapeHTML(f.id)}" aria-label="Xem vùng ${escapeHTML(f.label)}"><span class="finding-info"><strong>${f.risk === "critical" ? '<i class="risk-dot critical-dot" aria-label="Rủi ro cực cao"></i>' : f.risk === "high" ? '<i class="risk-dot" aria-label="Rủi ro cao"></i>' : ""}${escapeHTML(f.label)}</strong><span>${escapeHTML(f.text)}</span><small class="finding-type">${escapeHTML(f.type.toUpperCase())} · ${{ critical: "Cực cao", high: "Cao", medium: "Vừa", low: "Thấp" }[f.risk] || "Cần kiểm tra"}</small>${!fixtureId && f.type !== "manual" && f.ocr_confidence < 0.6 ? '<small class="review-flag">Cần kiểm tra</small>' : ""}</span></button>${f.type === "manual" ? `<button class="icon-button remove-finding" data-remove="${escapeHTML(f.id)}" aria-label="Xóa ${escapeHTML(f.label)}">${icon("x")}</button>` : `<details class="finding-details"><summary aria-label="Chi tiết ${escapeHTML(f.label)}">${icon("chevron")}</summary><dl><div><dt>Độ tin cậy OCR</dt><dd>${fixtureId ? "Mô phỏng" : `${Math.round(f.ocr_confidence * 100)}%`}</dd></div><div><dt>Điểm luật</dt><dd>${Number.isFinite(f.score) ? escapeHTML(String(f.score)) : "—"}</dd></div><div><dt>Rủi ro</dt><dd>${{ critical: "Cực cao", high: "Cao", medium: "Vừa", low: "Thấp" }[f.risk] || "—"}</dd></div></dl></details>`}</div>`,
          )
          .join("")
      : `<div class="empty-findings">${icon(original ? "eye" : "scan")}<h3>${original ? "Chưa có vùng đánh dấu" : "Chưa có kết quả"}</h3><p>${original ? "Tự đánh dấu thêm trên ảnh." : "Chọn một ảnh để bắt đầu."}</p></div>`;
    $("#selection-summary").textContent = original
      ? redacted
        ? `Đã che ${selected.size} vùng. Xem lại trước khi tải.`
        : `${selected.size}/${findings.length} vùng được chọn để che.`
      : "Chọn ảnh để bắt đầu kiểm tra.";
    $("#redact-selected").textContent =
      !findings.length && scanComplete
        ? "Chuẩn bị PNG"
        : `Che ${selected.size} vùng`;
    $("#redact-selected").hidden = !!redacted;
    $("#download-image").hidden = !redacted;
    $("#edit-redaction").hidden = !redacted;
    $("#redact-selected").disabled =
      !original ||
      (!selected.size && (findings.length > 0 || !scanComplete)) ||
      busy;
    $("#download-image").disabled = !redacted || busy;
    $("#toggle-draw").disabled = busy;
    $("#coordinate-form")
      .querySelectorAll("input,button")
      .forEach((el) => (el.disabled = busy));
    $("#start-scan").disabled = busy || !original;
    $("#retry-scan").disabled = busy;
    $("#error-manual").disabled = busy;
    $("#profile-select").disabled = busy;
    $("#destination-select").disabled = busy;
    $("#select-all").disabled = busy;
    $("#deselect-all").disabled = busy;
    $("#findings-list")
      .querySelectorAll("input")
      .forEach((input) => (input.disabled = busy));
    syncWorkflow();
    if (focusedCheckbox)
      $("#findings-list")
        .querySelector(`[data-finding="${CSS.escape(focusedCheckbox)}"]`)
        ?.focus({ preventScroll: true });
    paint();
  }
  function setBusy(value) {
    busy = value;
    $("#scan-progress").hidden = !value || exporting;
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
    scanTicket = null;
    scanComplete = false;
    ticketExpired = false;
    scanProfile = getDetectionConfig().profile;
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
      scanTicket = result.scan_ticket || null;
      scanComplete = result.status !== "demo";
      scanProfile = result.profile || scanProfile;
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
    exporting = false;
    scanComplete = false;
    ticketExpired = false;
    workflowStep = 2;
    scanTicket = null;
    scanProfile = getDetectionConfig().profile;
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
      scanComplete = true;
      scanTicket = scanned.scan_ticket || null;
      scanProfile = scanned.profile || scanProfile;
      $("#profile-select").value = scanProfile;
      $("#destination-select").value =
        scanned.destination || getDetectionConfig().destination;
      findings = scanned.findings;
      selected = new Set(findings.map((f) => f.id));
      $("#result-status").textContent = scanned.message;
      $("#scan-warnings").textContent = (scanned.warnings || []).join(" ");
      setBusy(false);
    } else runScan();
  }
  async function importFile(file) {
    if (!file) return;
    exporting = false;
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
    exporting = false;
    scanComplete = false;
    workflowStep = 1;
    scanTicket = null;
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
    goStep(4, false);
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
      if ($("#scanner-error").textContent) toast("Đã cập nhật vùng che.");
      setError();
      view = "after";
      setMobilePanel("image");
      stopDrawing();
      $("#view-after").disabled = false;
      resetPolicy();
      renderFindings();
      $("#workflow-next").focus({ preventScroll: true });
    } catch (error) {
      setError(error.message);
    }
  };
  $("#download-image").onclick = async () => {
    if (!redacted || busy) return;
    const exportCanvas = redacted,
      exportGeneration = generation;

    if (scanTicket && !fixtureId) {
      exporting = true;
      setBusy(true);
      setError("");
      try {
        const dest = $("#destination-select")?.value || "public";
        const selectedBoxes = findings
          .filter((f) => selected.has(f.id))
          .map((f) => f.box);
        let exported;
        try {
          exported = await exportSecureImage(scanTicket, selectedBoxes, {
            destination: dest,
          });
        } catch (err) {
          if (
            disposed ||
            exportGeneration !== generation ||
            exportCanvas !== redacted
          )
            return;
          if (err.code !== "CONFIRMATION_REQUIRED") throw err;
          if (
            !window.confirm(
              "Ảnh còn thông tin chưa che hoặc vùng OCR chưa rõ. Bạn đã kiểm tra và vẫn muốn tải ảnh này?",
            )
          )
            return;
          exported = await exportSecureImage(scanTicket, selectedBoxes, {
            destination: dest,
            confirmedWarnings: err.reasons,
          });
        }
        const { blob, hash } = exported;
        if (disposed || exportGeneration !== generation) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "screenguard-protected.png";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        toast("Đã tải ảnh đã che.");
        const hashEl = $("#export-hash-pill");
        if (hashEl) {
          exportedHash = hash;
          hashEl.hidden = false;
          hashEl.textContent = `SHA-256: ${hash}`;
          hashEl.title = `Mã băm toàn vẹn: ${hash}`;
        }
      } catch (err) {
        if (disposed || exportGeneration !== generation) return;
        resetPolicy();
        if (err.code === "POLICY_BLOCKED") {
          setError(
            "Còn vùng bắt buộc che. Hãy chọn vùng và che lại trước khi tải.",
          );
        } else {
          setError(err.message || "Xuất ảnh thất bại.");
        }
      } finally {
        if (!disposed && exportGeneration === generation) {
          exporting = false;
          setBusy(false);
        }
      }
      return;
    }

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
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
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
  const profileSelect = $("#profile-select");
  const destSelect = $("#destination-select");
  if (profileSelect) {
    profileSelect.value = getDetectionConfig().profile || "personal";
    profileSelect.onchange = (e) => {
      const cfg = getDetectionConfig();
      cfg.profile = e.target.value;
      updateDetectionConfig(cfg);
      if (original) runScan();
    };
  }
  if (destSelect) {
    destSelect.value = getDetectionConfig().destination || "public";
    destSelect.onchange = (e) => {
      exportedHash = "";
      $("#export-hash-pill").hidden = true;
      const cfg = getDetectionConfig();
      cfg.destination = e.target.value;
      updateDetectionConfig(cfg);
      renderFindings();
    };
  }
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
    clearInterval(policyTimer);
    window.removeEventListener("focus", refreshVisiblePolicy);
    policySerial++;
    policyController?.abort();
    window.removeEventListener("workflow:navigate", navigate);
    document
      .querySelectorAll("button[data-workflow-step]")
      .forEach((button) => {
        button.classList.remove("active", "is-complete");
        button.removeAttribute("aria-current");
      });
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
