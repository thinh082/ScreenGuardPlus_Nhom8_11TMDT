import { icon } from "../components/icons.js";
import { heading, escapeHTML, toast, notice } from "../components/ui.js";
import {
  DATA_TYPES,
  getDetectionConfig,
  updateDetectionConfig,
} from "../services/config-service.js";
export function configurationPage(main) {
  let config = getDetectionConfig();
  function save() {
    try {
      const result = updateDetectionConfig(config);
      toast(
        result.persisted
          ? "Đã lưu cấu hình trên thiết bị."
          : "Đã áp dụng cho phiên này; trình duyệt không cho phép lưu cục bộ.",
      );
    } catch (error) {
      toast(error.message, true);
      config = getDetectionConfig();
    }
  }
  function render() {
    main.innerHTML =
      heading(
        "PHẠM VI BẢO VỆ",
        "Dữ liệu nhạy cảm",
        "Chọn những thông tin bạn muốn kiểm tra trước khi chia sẻ.",
        `<span class="badge mint">${Object.values(config.types).filter(Boolean).length}/6 loại đang bật</span>`,
      ) +
      `
    ${notice("Cấu hình này được dùng để lọc kết quả ảnh mẫu và chuẩn bị cho OCR thực tế. Keyword/Regex chưa được thực thi trong Phase 1.")}
    <section class="config-grid">${DATA_TYPES.map((t) => `<article class="panel config-card"><div class="row-between"><span class="icon-tile ${t.risk === "high" ? "amber" : "mint"}">${icon(t.icon)}</span><label class="switch"><input type="checkbox" data-type="${t.id}" ${config.types[t.id] ? "checked" : ""} aria-label="Bật ${t.name}"><span></span></label></div><h2>${t.name}</h2><p>${t.description}</p><div class="config-example"><code>${t.example}</code><span class="risk ${t.risk === "high" ? "high" : "medium"}">${t.risk === "high" ? "Rủi ro cao" : t.risk === "custom" ? "Tùy chỉnh" : "Rủi ro vừa"}</span></div></article>`).join("")}</section>
    <section class="panel rules-panel"><div class="section-title"><div><p class="eyebrow">MỞ RỘNG PHẠM VI</p><h2>Quy tắc của bạn</h2></div><span class="small muted">${config.rules.length}/30 quy tắc</span></div>
    <form id="rule-form"><div class="rule-fields"><label>Tên quy tắc<input name="name" required maxlength="60" placeholder="Ví dụ: Mã nhân viên"></label><label>Loại<select name="kind"><option value="keyword">Từ khóa (Keyword)</option><option value="regex">Biểu thức (Regex)</option></select></label><label class="pattern-field">Từ khóa / Biểu thức<input name="pattern" required maxlength="200" placeholder="Ví dụ: NV-[0-9]{6}"></label><label>Mức rủi ro<select name="risk"><option value="medium">Vừa</option><option value="high">Cao</option><option value="low">Thấp</option></select></label><button class="button primary" type="submit">${icon("plus")} Thêm quy tắc</button></div><p id="rule-error" class="error-text" role="alert"></p></form>
    <div class="rules-list">${config.rules.length ? config.rules.map((rule) => `<div class="rule-row"><span class="icon-tile small-tile">${icon("code")}</span><div class="rule-info"><strong>${escapeHTML(rule.name)}</strong><code>${escapeHTML(rule.kind)} · ${escapeHTML(rule.pattern)}</code></div><span class="risk ${rule.risk}">${{ high: "Cao", medium: "Vừa", low: "Thấp" }[rule.risk]}</span><label class="switch"><input type="checkbox" data-rule="${escapeHTML(rule.id)}" ${rule.enabled ? "checked" : ""} aria-label="Bật quy tắc ${escapeHTML(rule.name)}"><span></span></label><button class="icon-button" data-delete="${escapeHTML(rule.id)}" aria-label="Xóa quy tắc ${escapeHTML(rule.name)}">${icon("trash")}</button></div>`).join("") : `<div class="empty-inline">${icon("code")}<div><strong>Chưa có quy tắc tùy chỉnh</strong><p>Thêm từ khóa hoặc Regex để chuẩn bị cho bộ nhận diện của bạn.</p></div></div>`}</div></section>`;
    main.querySelectorAll("[data-type]").forEach((input) =>
      input.addEventListener("change", () => {
        config.types[input.dataset.type] = input.checked;
        save();
        render();
      }),
    );
    main.querySelectorAll("[data-rule]").forEach((input) =>
      input.addEventListener("change", () => {
        config.rules.find((r) => r.id === input.dataset.rule).enabled =
          input.checked;
        save();
      }),
    );
    main.querySelectorAll("[data-delete]").forEach((button) =>
      button.addEventListener("click", () => {
        config.rules = config.rules.filter(
          (r) => r.id !== button.dataset.delete,
        );
        save();
        render();
      }),
    );
    main.querySelector("#rule-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const rule = {
        id: crypto.randomUUID(),
        name: form.get("name").trim(),
        kind: form.get("kind"),
        pattern: form.get("pattern").trim(),
        risk: form.get("risk"),
        enabled: true,
      };
      try {
        const result = updateDetectionConfig({
          ...config,
          rules: [...config.rules, rule],
        });
        config = result.config;
        toast(
          result.persisted
            ? "Đã thêm quy tắc."
            : "Đã thêm quy tắc cho phiên này.",
        );
        render();
      } catch (error) {
        main.querySelector("#rule-error").textContent = error.message;
      }
    });
  }
  render();
}
