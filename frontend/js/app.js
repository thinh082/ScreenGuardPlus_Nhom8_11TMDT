import { icon } from "./components/icons.js";
import { toast } from "./components/ui.js";
import { registerRoute, startRouter } from "./router.js";
import { dashboardPage } from "./pages/dashboard.js";
import { scannerPage } from "./pages/scanner.js";
import { configurationPage } from "./pages/configuration.js";
import { settingsPage } from "./pages/settings.js";
import { getTheme, toggleTheme } from "./services/theme-service.js";
import { syncDesktopConfig } from "./services/desktop-service.js";
import {
  notificationsPage,
  startNotificationBell,
} from "./pages/notifications.js";

const navigation = [
  ["/scanner", "scan", "Kiểm tra ảnh"],
  ["/configuration", "sliders", "Quy tắc bảo vệ"],
  ["/settings", "settings", "Cài đặt"],
];
const workflowSteps = [
  "Tiếp nhận ảnh",
  "Phát hiện rủi ro",
  "Đánh giá chính sách",
  "Che thông tin",
  "Kiểm chứng & xuất",
];
function links(mobile = false) {
  return navigation
    .map(
      ([path, glyph, label]) =>
        `<a href="#${path}" aria-label="${label}" data-${mobile ? "mobile-nav" : "nav"}="${path}">${icon(glyph)}<span>${mobile ? { "/scanner": "Kiểm tra ảnh", "/configuration": "Quy tắc bảo vệ", "/settings": "Cài đặt" }[path] : label}</span></a>`,
    )
    .join("");
}
document.querySelector("#app").innerHTML = `
  <aside class="sidebar" id="sidebar">
    <a href="#/scanner" class="brand" data-nav="/scanner" aria-label="ScreenGuard+ trang chủ"><span class="brand-icon">${icon("shield")}</span><span>ScreenGuard<b>+</b></span></a>
    <p class="sidebar-caption">QUY TRÌNH BẢO VỆ</p>
    <nav class="workflow-nav" aria-label="Quy trình bảo vệ">${workflowSteps.map((label, index) => `<button type="button" class="workflow-link" data-workflow-step="${index + 1}"><span class="step-number">${String(index + 1).padStart(2, "0")}</span><span>${label}</span><span class="step-state" aria-hidden="true"></span></button>`).join("")}</nav>
    <p class="sidebar-caption tools-caption">CÔNG CỤ</p>
    <nav class="tools-nav" aria-label="Công cụ">${links().replace(/<a[^>]+data-nav="\/scanner"[\s\S]*?<\/a>/, "")}<a href="#/notifications" data-nav="/notifications">${icon("bell")}<span>Thông báo</span></a></nav>
    <div class="sidebar-bottom"><button id="install-app" class="install-button">${icon("download")} Cài ứng dụng</button><a class="about-link" href="#/overview" data-nav="/overview" aria-label="Giới thiệu ScreenGuard+">${icon("info")}<span>Về ScreenGuard+</span></a></div>
  </aside>
  <button class="sidebar-backdrop" aria-label="Đóng điều hướng"></button>
  <div class="app-content">
    <header class="topbar"><div class="topbar-left"><button id="menu-button" class="icon-button mobile-menu" aria-label="Mở điều hướng" aria-controls="sidebar" aria-expanded="false">${icon("menu")}</button><span class="mobile-brand">ScreenGuard<span>+</span></span><span class="breadcrumb" id="breadcrumb-page">Kiểm tra ảnh</span></div><div class="topbar-right"><span id="network-status" class="connection"></span><button id="theme-toggle" class="theme-toggle" aria-label="Chuyển giao diện"></button></div></header>
    <main id="main" tabindex="-1"></main>
  </div>
  <nav class="mobile-nav" aria-label="Điều hướng nhanh">${links(true)}</nav>
  <dialog id="install-dialog" class="confirm-dialog"><div class="section-title"><h2>Cài ScreenGuard+</h2><button class="icon-button" id="close-install" aria-label="Đóng">${icon("x")}</button></div><p>Chrome / Edge: chọn “Cài đặt ứng dụng” trong menu trình duyệt.</p><p>iPhone / iPad: mở Safari → Chia sẻ → Thêm vào Màn hình chính.</p><p class="small muted">Cần HTTPS hoặc localhost.</p></dialog>`;
document
  .querySelector(".topbar-right")
  .insertAdjacentHTML(
    "afterbegin",
    `<a id="notifications-button" href="#/notifications" class="icon-button notifications-button" aria-label="Thông báo" title="Thông báo">${icon("bell")}<span id="notification-badge" hidden aria-live="polite"></span></a>`,
  );

const menu = document.querySelector("#menu-button");
const mobileViewport = matchMedia("(max-width: 760px)");
function syncSidebar() {
  document.querySelector("#sidebar").inert =
    mobileViewport.matches && !document.body.classList.contains("menu-open");
}
menu.onclick = () => {
  const open = document.body.classList.toggle("menu-open");
  menu.setAttribute("aria-expanded", String(open));
  syncSidebar();
};
document.querySelector(".sidebar-backdrop").onclick = () => {
  document.body.classList.remove("menu-open");
  menu.setAttribute("aria-expanded", "false");
  syncSidebar();
};
mobileViewport.addEventListener("change", syncSidebar);
window.addEventListener("hashchange", () => queueMicrotask(syncSidebar));
syncSidebar();
document.querySelectorAll("[data-workflow-step]").forEach(
  (button) =>
    (button.onclick = () => {
      const step = Number(button.dataset.workflowStep);
      if (document.querySelector("#workflow-step-select"))
        window.dispatchEvent(
          new CustomEvent("workflow:navigate", { detail: step }),
        );
      else location.hash = `/scanner?step=${step}`;
      document.body.classList.remove("menu-open");
      menu.setAttribute("aria-expanded", "false");
      syncSidebar();
    }),
);
document.querySelector(".skip-link").onclick = (event) => {
  event.preventDefault();
  document.querySelector("#main").focus();
};
function updateNetwork() {
  document.querySelector("#network-status").hidden = navigator.onLine;
  document.querySelector("#network-status").innerHTML =
    `<span class="live-dot ${navigator.onLine ? "" : "offline"}"></span><span>${navigator.onLine ? "Trực tuyến" : "Ngoại tuyến"}</span>`;
}
window.addEventListener("online", updateNetwork);
window.addEventListener("offline", updateNetwork);
updateNetwork();
function updateTitle() {
  const path = (location.hash.slice(1) || "/scanner").split("?")[0];
  const title =
    navigation.find((n) => n[0] === path)?.[2] ||
    (path === "/overview"
      ? "Tổng quan"
      : path === "/notifications"
        ? "Thông báo"
        : "Kiểm tra ảnh");
  document.querySelector("#breadcrumb-page").textContent = title;
  document.title = `${title} · ScreenGuard+`;
}
window.addEventListener("hashchange", updateTitle);
updateTitle();
function renderTheme() {
  const dark = getTheme() === "dark";
  const button = document.querySelector("#theme-toggle");
  button.innerHTML = `${icon(dark ? "sun" : "moon")}<span>${dark ? "Sáng" : "Tối"}</span>`;
  button.setAttribute(
    "aria-label",
    `Chuyển sang giao diện ${dark ? "sáng" : "tối"}`,
  );
  button.setAttribute("aria-pressed", String(dark));
}
document.querySelector("#theme-toggle").onclick = toggleTheme;
window.addEventListener("themechange", renderTheme);
renderTheme();
registerRoute("/overview", dashboardPage);
registerRoute("/scanner", scannerPage);
registerRoute("/configuration", configurationPage);
registerRoute("/settings", settingsPage);
registerRoute("/notifications", notificationsPage);
startRouter();
startNotificationBell();
// The agent retains the last synchronized config while the PWA is closed.
const syncCompanion = () =>
  syncDesktopConfig().catch((error) => {
    if (error.desktopConfig) toast(error.message, true);
  });
window.addEventListener("configchange", syncCompanion);
syncCompanion();
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  document.querySelector("#install-app").classList.add("available");
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  toast("Đã cài ScreenGuard+.");
});
document.querySelector("#install-app").onclick = async () => {
  if (deferredPrompt) {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    await prompt.prompt();
    await prompt.userChoice;
  } else document.querySelector("#install-dialog").showModal();
};
document.querySelector("#close-install").onclick = () =>
  document.querySelector("#install-dialog").close();
if ("serviceWorker" in navigator && isSecureContext)
  navigator.serviceWorker
    .register("./service-worker.js", { updateViaCache: "none" })
    .then((registration) => {
      const update = () => registration.update().catch(() => {});
      window.addEventListener("focus", update);
      window.addEventListener("online", update);
    })
    .catch(() => toast("Chưa bật được chế độ ngoại tuyến.", true));
