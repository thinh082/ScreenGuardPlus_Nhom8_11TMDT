import { icon } from "./components/icons.js";
import { toast } from "./components/ui.js";
import { registerRoute, startRouter } from "./router.js";
import { dashboardPage } from "./pages/dashboard.js";
import { scannerPage } from "./pages/scanner.js";
import { configurationPage } from "./pages/configuration.js";
import { settingsPage } from "./pages/settings.js";

const navigation = [
  ["/", "grid", "Tổng quan"],
  ["/scanner", "scan", "Kiểm tra hình ảnh"],
  ["/configuration", "sliders", "Dữ liệu nhạy cảm"],
  ["/settings", "settings", "Cài đặt & bảo vệ"],
];
document.querySelector("#app").innerHTML =
  `<aside class="sidebar" id="sidebar"><a href="#/" class="brand" aria-label="ScreenGuard+ trang chủ"><span class="brand-icon">${icon("shield")}</span><span>ScreenGuard<span class="mint-text">+</span><small>SHARE WITH CONFIDENCE</small></span></a><span class="nav-label">KHÔNG GIAN LÀM VIỆC</span><nav aria-label="Điều hướng chính">${navigation.map(([path, glyph, label]) => `<a href="#${path}" data-nav="${path}">${icon(glyph)}<span>${label}</span>${icon("chevron", "nav-chevron")}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="local-card"><span class="icon-tile mint small-tile">${icon("lock")}</span><strong>Riêng tư từ thiết kế</strong><p>Ảnh của bạn ở lại<br>trên thiết bị của bạn.</p><span class="local-label"><span class="live-dot"></span> LOCAL PROCESSING</span></div><button id="install-app" class="install-button">${icon("download")} Cài đặt ứng dụng ${icon("plus")}</button><div class="project-label"><span class="avatar">08</span><span>Nhóm 08<small>Dự án ScreenGuard+</small></span><span class="version">v1.0</span></div></div></aside><button class="sidebar-backdrop" aria-label="Đóng điều hướng"></button><div class="app-content"><header class="topbar"><div class="topbar-left"><button id="menu-button" class="icon-button mobile-menu" aria-label="Mở điều hướng" aria-controls="sidebar" aria-expanded="false">${icon("menu")}</button><span class="breadcrumb">Không gian làm việc <span>/</span> <strong id="breadcrumb-page">Tổng quan</strong></span></div><div class="topbar-right"><span id="network-status" class="connection"><span class="live-dot"></span> Trực tuyến</span><span class="topbar-divider"></span><span class="badge subtle-badge">BẢN THỬ NGHIỆM</span><span class="topbar-shield">${icon("shield")}</span></div></header><main id="main" tabindex="-1"></main></div><dialog id="install-dialog" class="confirm-dialog"><div class="section-title"><h2>Cài đặt ScreenGuard+</h2><button class="icon-button" id="close-install" aria-label="Đóng">${icon("x")}</button></div><p id="install-instructions">Trên Chrome hoặc Edge, mở menu trình duyệt và chọn “Cài đặt ứng dụng”. Trên iPhone/iPad, mở bằng Safari, nhấn Chia sẻ → Thêm vào Màn hình chính.</p><p class="small muted">Cần truy cập qua HTTPS hoặc localhost. Bạn cũng có thể tiếp tục sử dụng ngay trên trình duyệt.</p></dialog>`;
const menu = document.querySelector("#menu-button");
const mobileViewport = window.matchMedia("(max-width: 720px)");
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
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector("#main").focus();
  document.querySelector("#main").scrollIntoView();
});
const updateNetwork = () => {
  const el = document.querySelector("#network-status");
  el.innerHTML = `<span class="live-dot ${navigator.onLine ? "" : "offline"}"></span> ${navigator.onLine ? "Trực tuyến" : "Ngoại tuyến"}`;
};
window.addEventListener("online", updateNetwork);
window.addEventListener("offline", updateNetwork);
updateNetwork();
function updateTitle() {
  const path = (location.hash.slice(1) || "/").split("?")[0];
  const title = navigation.find((n) => n[0] === path)?.[2] || "Tổng quan";
  document.querySelector("#breadcrumb-page").textContent = title;
  document.title = `${title} · ScreenGuard+`;
}
window.addEventListener("hashchange", updateTitle);
updateTitle();
registerRoute("/", dashboardPage);
registerRoute("/scanner", scannerPage);
registerRoute("/configuration", configurationPage);
registerRoute("/settings", settingsPage);
startRouter();
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  document.querySelector("#install-app").classList.add("available");
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  toast("Đã cài đặt ScreenGuard+.");
  document.querySelector("#install-app").textContent = "Đã cài đặt ứng dụng";
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
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker
    .register("./service-worker.js")
    .catch(() =>
      toast(
        "Chưa bật được chế độ ngoại tuyến. Bạn vẫn có thể dùng ứng dụng trực tuyến.",
        true,
      ),
    );
}
