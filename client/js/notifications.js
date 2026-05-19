import { renderLayout }      from "./layout.js";
import { loadNotifications } from "./layout.js";

const user = renderLayout({ activeNav: "" });
if (!user) window.location.href = "login.html";

const NOTIF_KEY = "emission_notif_state";

function _readState() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}"); } catch { return {}; }
}
function _writeState(s) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const TYPE_ICON = {
  reminder: "🔔",
  warning:  "⚠️",
  task:     "📋",
  success:  "✅",
};

function _notifTargetUrl(n) {
  const id = n.id || "";
  if (id === "no_entry_this_month")    return "/pages/emissions.html";
  if (id.startsWith("carbon_spike_")) return "/pages/emissions.html";
  if (id.startsWith("task_done_"))    return "/pages/household-tasks.html";
  if (id.startsWith("due_soon_"))     return "/pages/household-tasks.html";
  if (id.startsWith("task_"))         return "/pages/household-tasks.html";
  if (id.startsWith("co_due_soon_"))  return "/pages/company-tasks.html";
  if (n.type === "gamification")      return "/pages/dashboard.html";
  return "";
}

function render(notifications) {
  const list      = document.getElementById("notifPageList");
  const markAllBtn = document.getElementById("markAllPageBtn");
  if (!list) return;

  if (!notifications.length) {
    list.innerHTML = `
      <div style="padding: var(--spacing-xl); text-align:center; color:var(--color-text-muted); font-size:14px;">
        Henüz bildirimin yok.
      </div>`;
    return;
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  if (markAllBtn && unreadCount > 0) markAllBtn.style.display = "block";

  list.innerHTML = notifications.map(n => {
    const url  = n.targetUrl || _notifTargetUrl(n);
    const icon = TYPE_ICON[n.type] || "🔔";
    return `
      <div class="notif-page-item ${n.read ? "read" : "unread"}"
           data-id="${n.id}"
           data-url="${url}"
           style="display:flex; align-items:flex-start; gap:14px; padding:16px var(--spacing-lg);
                  border-bottom:1px solid var(--color-border); cursor:${url ? "pointer" : "default"};
                  background:${n.read ? "transparent" : "rgba(91,173,142,0.06)"};
                  transition:background 0.15s ease;">
        <span style="font-size:22px; line-height:1; flex-shrink:0;">${icon}</span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:14px; font-weight:${n.read ? "500" : "700"}; color:var(--color-text); margin-bottom:3px;">
            ${n.title}
            ${!n.read ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--color-primary);margin-left:6px;vertical-align:middle;"></span>' : ""}
          </div>
          <div style="font-size:13px; color:var(--color-text-muted); line-height:1.5;">${n.desc}</div>
        </div>
        ${url ? '<span style="color:var(--color-text-muted);font-size:18px;line-height:1;flex-shrink:0;align-self:center;">›</span>' : ""}
      </div>`;
  }).join("");

  // Mark all as read on click
  markAllBtn?.addEventListener("click", () => {
    const state = _readState();
    notifications.forEach(n => { if (state[n.id]) state[n.id].read = true; });
    _writeState(state);
    list.querySelectorAll(".notif-page-item.unread").forEach(el => {
      el.classList.replace("unread", "read");
      el.style.background = "transparent";
      el.querySelector("[style*='font-weight:700']")?.style.setProperty("font-weight", "500");
    });
    list.querySelectorAll("[style*='border-radius:50%']").forEach(dot => dot.remove());
    markAllBtn.style.display = "none";
  }, { once: true });

  // Item click: mark read + navigate
  list.addEventListener("click", e => {
    const item = e.target.closest(".notif-page-item");
    if (!item) return;

    const id  = item.dataset.id;
    const url = item.dataset.url;

    if (id) {
      const state = _readState();
      if (state[id]) { state[id].read = true; _writeState(state); }
      item.classList.replace("unread", "read");
      item.style.background = "transparent";
    }

    if (url) window.location.href = url;
  });
}

(async () => {
  try {
    const notifs = await loadNotifications();
    render(notifs);
  } catch {
    const list = document.getElementById("notifPageList");
    if (list) list.innerHTML = `<div style="padding:var(--spacing-xl);text-align:center;color:var(--color-text-muted);font-size:14px;">Bildirimler yüklenemedi.</div>`;
  }
})();
