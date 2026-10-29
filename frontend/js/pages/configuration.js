import { icon } from "../components/icons.js";
import { heading, escapeHTML, toast } from "../components/ui.js";
import {
  DATA_TYPES,
  getDetectionConfig,
  updateDetectionConfig,
  validateConfigWithBackend,
} from "../services/config-service.js";
export function configurationPage(main) {
  let config = getDetectionConfig();
  function save() {
    try {
      const result = updateDetectionConfig(config);
      toast(
        result.persisted ? "Đã lưu cấu hình." : "Đã áp dụng trong phiên này.",
      );
    } catch (error) {
      toast(error.message, true);
      config = getDetectionConfig();
    }
  }
  function render() {
    main.innerHTML =
      heading("", "Quy tắc bảo vệ", "Chọn thông tin cần tìm trong ảnh.") +
      `
      <section class="settings-section"><h2>Nhận diện mặc định</h2><div class="protection-list" aria-label="Loại dữ liệu">${DATA_TYPES.filter(
        (t) => t.id !== "custom",
      )
        .map(
          (t) =>
            `<div class="protection-row">${icon(t.icon)}<div class="type-copy"><h3>${t.name}</h3><p>${t.example}</p></div><label class="switch"><input type="checkbox" data-type="${t.id}" ${config.types[t.id] ? "checked" : ""} aria-label="Bật ${t.name}"><span></span></label></div>`,
        )
        .join("")}</div></section>
      <section class="settings-section"><div class="rules-header"><h2>Quy tắc riêng <span class="counter">${config.rules.length} quy tắc</span></h2><div class="rules-header-controls"><span class="custom-master">Áp dụng<label class="switch"><input type="checkbox" data-type="custom" ${config.types.custom ? "checked" : ""} aria-label="Bật quy tắc riêng"><span></span></label></span><button id="add-rule" class="button secondary small-button">${icon("plus")} Thêm quy tắc</button></div></div><div class="rules-list">${config.rules.length ? config.rules.map((rule) => `<div class="rule-row"><div class="rule-info"><strong>${escapeHTML(rule.name)}</strong><code>${escapeHTML(rule.pattern)}</code></div><span class="risk ${rule.risk}">${{ high: "Cao", medium: "Vừa", low: "Thấp" }[rule.risk]}</span><label class="switch"><input type="checkbox" data-rule="${escapeHTML(rule.id)}" ${rule.enabled ? "checked" : ""} aria-label="Bật quy tắc ${escapeHTML(rule.name)}"><span></span></label><button class="icon-button" data-delete="${escapeHTML(rule.id)}" aria-label="Xóa quy tắc ${escapeHTML(rule.name)}">${icon("trash")}</button></div>`).join("") : `<div class="empty-inline">Chưa có quy tắc riêng.</div>`}</div></section>
      <p class="compact-note">Áp dụng cho lần kiểm tra tiếp theo.</p>
      <dialog id="rule-dialog" class="rule-dialog"><div class="section-title"><h2>Thêm quy tắc</h2><button id="close-rule" class="icon-button" aria-label="Đóng quy tắc">${icon("x")}</button></div><form id="rule-form"><div class="rule-fields"><label>Tên quy tắc<input name="name" required maxlength="60" placeholder="Ví dụ: Mã nhân viên"></label><label>Loại<select name="kind"><option value="keyword">Từ khóa</option><option value="regex">Regex</option></select></label><label class="pattern-field">Từ khóa / Biểu thức<input name="pattern" required maxlength="200" placeholder="Ví dụ: NV-[0-9]{6}"></label><label>Mức rủi ro<select name="risk"><option value="medium">Vừa</option><option value="high">Cao</option><option value="low">Thấp</option></select></label></div><p id="rule-error" class="error-text" role="alert"></p><div class="rule-form-actions"><button type="button" id="cancel-rule" class="button secondary">Hủy</button><button class="button primary" type="submit">Thêm quy tắc</button></div></form><details class="advanced-details"><summary>Giới hạn Regex</summary><p>Tối đa 200 ký tự. Không hỗ trợ lookaround hoặc backreference. Regex được giới hạn độ phức tạp và thời gian chạy.</p></details></dialog>`;
    const dialog = main.querySelector("#rule-dialog");
    let validationVersion = 0;
    dialog.addEventListener("close", () => {
      validationVersion++;
    });
    main.querySelector("#add-rule").onclick = () => dialog.showModal();
    main.querySelector("#close-rule").onclick = () => dialog.close();
    main.querySelector("#cancel-rule").onclick = () => dialog.close();
    main.querySelectorAll("[data-type]").forEach(
      (input) =>
        (input.onchange = () => {
          config.types[input.dataset.type] = input.checked;
          save();
          render();
        }),
    );
    main.querySelectorAll("[data-rule]").forEach(
      (input) =>
        (input.onchange = () => {
          config.rules.find((r) => r.id === input.dataset.rule).enabled =
            input.checked;
          save();
        }),
    );
    main.querySelectorAll("[data-delete]").forEach(
      (button) =>
        (button.onclick = () => {
          config.rules = config.rules.filter(
            (r) => r.id !== button.dataset.delete,
          );
          save();
          render();
        }),
    );
    main.querySelector("#rule-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type="submit"]');
      if (submit.disabled) return;
      const fields = new FormData(form);
      const rule = {
        id: crypto.randomUUID(),
        name: fields.get("name").trim(),
        kind: fields.get("kind"),
        pattern: fields.get("pattern").trim(),
        risk: fields.get("risk"),
        enabled: true,
      };
      submit.disabled = true;
      const requestVersion = validationVersion;
      try {
        const next = { ...config, rules: [...config.rules, rule] };
        const verified = await validateConfigWithBackend(next);
        if (
          !form.isConnected ||
          !dialog.open ||
          requestVersion !== validationVersion
        )
          return;
        const result = updateDetectionConfig(next);
        config = result.config;
        dialog.close();
        render();
        toast(
          !verified
            ? "Đã lưu cục bộ; sẽ xác thực khi quét."
            : result.persisted
              ? "Đã thêm quy tắc."
              : "Đã thêm trong phiên này.",
        );
      } catch (error) {
        if (
          form.isConnected &&
          dialog.open &&
          requestVersion === validationVersion
        )
          main.querySelector("#rule-error").textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    };
  }
  render();
}
