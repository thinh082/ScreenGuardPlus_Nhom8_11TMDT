import { icon } from "./icons.js";
export function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
let toastTimer;
export function toast(message, error = false) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 4500);
}
export function heading(eyebrow, title, subtitle, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${action}</div>`;
}
export function notice(message, tone = "info") {
  return `<div class="notice ${tone}">${icon(tone === "warning" ? "alert" : "info")}<p>${message}</p></div>`;
}
