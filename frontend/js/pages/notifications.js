import { heading, escapeHTML } from "../components/ui.js";
import { icon } from "../components/icons.js";
import { desktopRequest } from "../services/desktop-service.js";

export function notificationsPage(main) {
  main.innerHTML =
    heading("", "Thông báo", "Ảnh chụp đang chờ bạn kiểm tra.") +
    `<div class="notification-toolbar"><p id="notification-summary" class="muted" role="status">Đang kết nối agent…</p><button id="refresh-notifications" class="button secondary small-button">Làm mới</button></div><p id="notification-error" class="error-text" role="alert"></p><div id="notification-list" class="notification-list"></div><p class="notification-note small muted">Chỉ giữ ảnh chờ trong phiên, tối đa 10 phút. Ảnh được xóa khỏi danh sách khi mở review hoặc bỏ qua.</p>`;
  let disposed = false,
    busy = false,
    snapshot = "";
  const controller = new AbortController();
  const $ = (selector) => main.querySelector(selector);
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const data = await desktopRequest("notifications", {
        signal: controller.signal,
      });
      if (disposed) return;
      $("#notification-error").textContent = "";
      const summary = !data.available
        ? "Agent chưa kết nối. Bật companion trong Cài đặt."
        : data.last_scan
          ? `Ảnh gần nhất: ${data.last_scan.findings ? `phát hiện ${data.last_scan.findings} vùng cần kiểm tra` : "không phát hiện PII"}.`
          : "Chưa có ảnh mới được kiểm tra trong phiên này.";
      if ($("#notification-summary").textContent !== summary)
        $("#notification-summary").textContent = summary;
      const items = data.items.filter((item) =>
        /^[A-Za-z0-9_-]{40,64}$/.test(item.id),
      );
      const signature = JSON.stringify(items);
      if (signature !== snapshot)
        $("#notification-list").innerHTML = items.length
          ? items
              .map(
                (item) =>
                  `<article class="notification-row"><span class="notification-symbol">${icon("alert")}</span><div class="notification-copy"><h2>Screenshot có ${escapeHTML(item.count)} vùng cần kiểm tra</h2><p>${escapeHTML(new Date(item.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }))} · Ảnh chưa được che</p></div><a class="button primary small-button" href="#/scanner?review=${encodeURIComponent(item.id)}">Xem và che ảnh</a><button class="icon-button" data-dismiss-notification="${escapeHTML(item.id)}" aria-label="Bỏ qua cảnh báo">${icon("x")}</button></article>`,
              )
              .join("")
          : `<div class="notifications-empty">${icon("bell")}<h2>Không có ảnh đang chờ</h2><p>Khi screenshot có PII, cảnh báo và nút xem ảnh sẽ xuất hiện ở đây.</p><a class="text-link" href="#/settings">Cài đặt cảnh báo ${icon("arrow")}</a></div>`;
      snapshot = signature;
      window.dispatchEvent(
        new CustomEvent("notificationscount", { detail: items.length }),
      );
    } catch (error) {
      if (!disposed) {
        $("#notification-summary").textContent =
          "Chưa kiểm tra được thông báo.";
        $("#notification-error").textContent = error.message;
      }
    } finally {
      busy = false;
    }
  }
  $("#notification-list").onclick = async (event) => {
    const button = event.target.closest("[data-dismiss-notification]");
    if (!button) return;
    button.disabled = true;
    try {
      await desktopRequest(
        `reviews/${encodeURIComponent(button.dataset.dismissNotification)}`,
        { method: "DELETE", signal: controller.signal },
      );
      await refresh();
    } catch (error) {
      if (!disposed) $("#notification-error").textContent = error.message;
    }
  };
  $("#refresh-notifications").onclick = refresh;
  refresh();
  const timer = setInterval(refresh, 3000);
  return () => {
    disposed = true;
    controller.abort();
    clearInterval(timer);
  };
}

export function startNotificationBell() {
  const badge = document.querySelector("#notification-badge");
  const button = document.querySelector("#notifications-button");
  const setCount = (count) => {
    if (badge.textContent !== String(count)) badge.textContent = count;
    badge.hidden = !count;
    button.setAttribute(
      "aria-label",
      count ? `Thông báo, ${count} ảnh chờ kiểm tra` : "Thông báo",
    );
  };
  window.addEventListener("notificationscount", (event) =>
    setCount(event.detail),
  );
  let pending = false;
  async function refresh() {
    if (pending) return;
    pending = true;
    try {
      const data = await desktopRequest("notifications");
      setCount(data.items.length);
    } catch {
      setCount(0);
    } finally {
      pending = false;
    }
  }
  refresh();
  setInterval(refresh, 5000);
  window.addEventListener("focus", refresh);
}
