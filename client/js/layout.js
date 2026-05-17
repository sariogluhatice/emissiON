import { getCurrentUser, logout } from "./utils/uiUtils.js";
import { ThemeManager } from "./utils/themeManager.js";

ThemeManager.init();

// ── Icon helpers ────────────────────────────────────────────────────────────

const SVG = (body, cls = "nav-icon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// ── Nav items ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    id: "nav-dashboard",
    href: "dashboard.html",
    label: "Özet Panel",
    icon: SVG(
      '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    ),
  },
  {
    id: "nav-household",
    href: "household.html",
    label: "Hanem",
    icon: SVG(
      '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    ),
  },
  {
    id: "nav-company",
    href: "company.html",
    label: "Şirket Paneli",
    icon: SVG(
      '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>',
    ),
    subItems: [
      { href: "company-cbam.html", label: "CBAM / Vergi Hesabı" },
      { href: "company-tasks.html", label: "Şirket Görevleri" },
      { href: "company-simulation.html", label: "Simülasyon" },
      { href: "company-profile.html", label: "Profili Düzenle" },
    ],
  },
  {
    id: "nav-emissions",
    href: "emissions.html",
    label: "Emisyon Takibi",
    icon: SVG('<path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
  },
  {
    id: "nav-add",
    href: "add-entry.html",
    label: "Yeni Kayıt Ekle",
    icon: SVG(
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
    ),
  },
  {
    id: "nav-insights",
    href: "smart-insights.html",
    label: "Karbon Zekası",
    icon: SVG(
      '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
    ),
  },
  {
    id: "nav-whatif",
    href: "what-if-simulation.html",
    label: "Gelecek Ay Planlayıcısı",
    icon: SVG(
      '<path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>',
    ),
  },
];

// ── Sidebar footer items ─────────────────────────────────────────────────────

const FOOTER_ITEMS = [];

// ── Notification helpers ─────────────────────────────────────────────────────

function formatNotifDate(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  return `${Math.floor(hrs / 24)} gün önce`;
}

function buildNotificationDropdown(notifications) {
  const unread = notifications.filter((n) => !n.read);

  const items =
    notifications.length === 0
      ? `<div class="notification-empty">Henüz bildirimin yok.</div>`
      : notifications
          .map(
            (n) => `
            <div class="notification-item ${n.read ? "read" : "unread"}" data-id="${n.id}">
                <div class="notification-body">
                    <div class="notification-item-title">${n.title}</div>
                    <div class="notification-item-desc">${n.desc}</div>
                    <div class="notification-item-date">${formatNotifDate(n.date)}</div>
                </div>
            </div>`,
          )
          .join("");

  return `
        <div class="notification-dropdown-header">
            <span class="notification-dropdown-title">Bildirimler</span>
            ${unread.length > 0 ? '<button class="notification-mark-all-btn" id="markAllReadBtn">Tümünü okundu yap</button>' : ""}
        </div>
        <div class="notification-list">${items}</div>
        <div class="notification-dropdown-footer">
            <a href="profile.html#notifications" class="notification-see-all">Tüm bildirimleri gör</a>
        </div>`;
}

// ── Sidebar collapse ─────────────────────────────────────────────────────────

const COLLAPSE_KEY = "sidebar-collapsed";

function isSidebarCollapsed() {
  return localStorage.getItem(COLLAPSE_KEY) === "true";
}

function setSidebarCollapsed(val) {
  localStorage.setItem(COLLAPSE_KEY, String(val));
}

// ── Main renderLayout ────────────────────────────────────────────────────────

export function renderLayout({ activeNav, title } = {}) {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }

  // Derive topbar/document title from active nav item when not explicitly provided
  const allNavItems = [...NAV_ITEMS, ...FOOTER_ITEMS];
  const activeItem = allNavItems.find((i) => i.id === activeNav);
  const resolvedTitle = title || activeItem?.label || "";
  if (resolvedTitle) document.title = `${resolvedTitle} – emissiON`;

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const sidebarEl = document.getElementById("sidebar");
  if (sidebarEl) {
    const collapsed = isSidebarCollapsed();
    if (collapsed) sidebarEl.classList.add("collapsed");

    const visibleItems = NAV_ITEMS.filter((item) => {
      if (item.id === "nav-household") return user.role === "household";
      if (item.id === "nav-company") return user.role === "company";
      return true;
    });

    const currentPage = window.location.pathname.split("/").pop() || "";

    const renderNavItem = (item) => {
      const { id, href, label, icon, subItems } = item;
      const isActive = id === activeNav;
      const itemHtml = `
                <a href="${href}" class="nav-item${isActive ? " active" : ""}" id="${id}">
                    ${icon}
                    <span class="nav-item-label">${label}</span>
                </a>`;
      if (subItems && isActive && user.role === "company") {
        const subHtml = subItems
          .map((sub) => {
            const isSubActive = currentPage === sub.href;
            return `<a href="${sub.href}" class="nav-subitem${isSubActive ? " nav-subitem--active" : ""}">${sub.label}</a>`;
          })
          .join("");
        return itemHtml + `<div class="nav-subitems">${subHtml}</div>`;
      }
      return itemHtml;
    };

    const footerHtml = FOOTER_ITEMS.map(
      (item) => `
            <a href="${item.href}" class="sidebar-footer-link${item.id === activeNav ? " active" : ""}" id="${item.id}">
                ${item.icon}
                <span class="sidebar-footer-label">${item.label}</span>
            </a>`,
    ).join("");

    const collapseIcon = SVG('<polyline points="15 18 9 12 15 6"/>', "w-4 h-4");

    sidebarEl.innerHTML = `
            <div class="sidebar-brand">
                <span class="sidebar-brand-text">emissiON</span>
                <button class="sidebar-collapse-btn" id="sidebarCollapseBtn" aria-label="Menüyü daralt/genişlet">
                    ${collapseIcon}
                </button>
            </div>
            <nav class="sidebar-nav">
                ${visibleItems.map(renderNavItem).join("")}
            </nav>
            <div class="sidebar-footer">
                ${footerHtml}
                <button class="btn-logout" id="logoutBtn" aria-label="Oturumu kapat">
                    ${SVG('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', "nav-icon")}
                    <span class="btn-logout-label">Oturumu Kapat</span>
                </button>
            </div>`;

    // collapse toggle
    document
      .getElementById("sidebarCollapseBtn")
      ?.addEventListener("click", () => {
        const isNowCollapsed = sidebarEl.classList.toggle("collapsed");
        setSidebarCollapsed(isNowCollapsed);
        // also toggle on app-shell for CSS sibling selector fallback
        document
          .querySelector(".app-shell")
          ?.classList.toggle("sidebar-collapsed", isNowCollapsed);
      });

    // sync app-shell class on load
    if (collapsed) {
      document.querySelector(".app-shell")?.classList.add("sidebar-collapsed");
    }

    document.getElementById("logoutBtn")?.addEventListener("click", logout);
  }

  // ── Topbar ────────────────────────────────────────────────────────────────
  const topbarEl = document.getElementById("topbar");
  if (topbarEl) {
    const displayName = user.name || user.email || "—";
    const initials = displayName.charAt(0).toUpperCase();

    const bellIcon = SVG(
      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      "w-5 h-5",
    );

    topbarEl.innerHTML = `
            <span class="topbar-title">${resolvedTitle}</span>
            <div class="topbar-user">
                <div class="topbar-streak-widget" id="topbarStreakWidget" style="display:none;">
                    <span class="streak-fire-icon">🔥</span>
                    <span class="streak-count-label" id="topbarStreakCount">0</span>
                </div>
                <div class="topbar-xp-widget" id="topbarXpWidget" style="display:none;" title="Seviye ilerlemen">
                    <span class="xp-level-badge" id="topbarLevel">Sv.1</span>
                    <div class="topbar-xp-bar">
                        <div class="topbar-xp-fill" id="topbarXpFill" style="width:0%"></div>
                    </div>
                </div>
                <button class="theme-toggle-btn" id="themeToggleBtn" aria-label="Tema değiştir"></button>
                <div class="notification-wrapper">
                    <button class="notification-btn" id="notificationBtn" aria-label="Bildirimler">
                        ${bellIcon}
                        <span class="notification-badge" id="notificationBadge"></span>
                    </button>
                    <div class="notification-dropdown" id="notificationDropdown">
                        ${buildNotificationDropdown([])}
                    </div>
                </div>
                <a href="profile.html" class="topbar-user-link" aria-label="Profilim">
                    <div class="user-avatar" id="userInitials">${initials}</div>
                </a>
            </div>`;

    // Theme toggle
    const themeBtn = document.getElementById("themeToggleBtn");
    ThemeManager._updateToggleIcon(ThemeManager.theme);
    themeBtn?.addEventListener("click", () => ThemeManager.toggle());

    // Notification toggle
    const notifBtn = document.getElementById("notificationBtn");
    const notifDropdown = document.getElementById("notificationDropdown");

    notifBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      notifDropdown?.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (!notifDropdown?.contains(e.target) && e.target !== notifBtn) {
        notifDropdown?.classList.remove("open");
      }
    });

    // Mark all/single read — updates DOM and persists to localStorage
    notifDropdown?.addEventListener("click", (e) => {
      const markAllBtn = e.target.closest("#markAllReadBtn");
      if (markAllBtn) {
        notifDropdown.querySelectorAll(".notification-item.unread").forEach(el => {
          el.classList.replace("unread", "read");
          if (el.dataset.id) _markNotifRead(el.dataset.id);
        });
        const badge = document.getElementById("notificationBadge");
        if (badge) badge.textContent = "";
        markAllBtn.remove();
        return;
      }

      const item = e.target.closest(".notification-item.unread");
      if (item) {
        item.classList.replace("unread", "read");
        if (item.dataset.id) _markNotifRead(item.dataset.id);
        const remaining = notifDropdown.querySelectorAll(".notification-item.unread").length;
        const badge = document.getElementById("notificationBadge");
        if (badge) badge.textContent = remaining > 0 ? String(remaining) : "";
      }
    });

    // Load real notifications asynchronously (non-blocking)
    _loadRealNotifications();
  }

  // Load gamification stats into topbar (non-blocking)
  _loadTopbarGamification();

  return user;
}

// ── Persistent notification state ────────────────────────────────────────────
// localStorage key: "emission_notif_state"
// Shape: { [id]: { read: bool, month: "YYYY-MM" } }

const _NOTIF_KEY = "emission_notif_state";

function _readNotifState() {
  try { return JSON.parse(localStorage.getItem(_NOTIF_KEY) || "{}"); }
  catch { return {}; }
}

function _writeNotifState(state) {
  try { localStorage.setItem(_NOTIF_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function _markNotifRead(id) {
  const state = _readNotifState();
  if (state[id]) { state[id].read = true; _writeNotifState(state); }
}

async function _loadRealNotifications() {
  const token = localStorage.getItem("emission_token") || sessionStorage.getItem("emission_token");
  if (!token) return;

  const badge       = document.getElementById("notificationBadge");
  const dropdown    = document.getElementById("notificationDropdown");
  if (!dropdown) return;

  const currentUser = getCurrentUser();
  const now         = new Date();
  const today       = now.toISOString().slice(0, 10);
  const in3Days     = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const thisMonth   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevMonth   = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const activeIds = new Set();
  const notifMeta = {};  // id → display data

  // ── 1. Aylık kayıt + karbon artışı (tüm kullanıcılar) ───────────────────────
  let thisMonthTotal = 0, prevMonthTotal = 0;
  try {
    const res = await fetch("/api/emissions", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const body    = await res.json();
      const records = body?.records ?? body?.data?.records ?? [];

      const hasThisMonth = records.some(r => String(r.date || "").startsWith(thisMonth));
      if (!hasThisMonth) activeIds.add("no_entry_this_month");

      thisMonthTotal = records
        .filter(r => String(r.date || "").startsWith(thisMonth))
        .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
      prevMonthTotal = records
        .filter(r => String(r.date || "").startsWith(prevMonth))
        .reduce((s, r) => s + parseFloat(r.amount || 0), 0);

      if (prevMonthTotal > 0 && thisMonthTotal > 0) {
        const spikePct = Math.round(((thisMonthTotal - prevMonthTotal) / prevMonthTotal) * 100);
        if (spikePct >= 20) {
          const spikeId = `carbon_spike_${thisMonth}`;
          activeIds.add(spikeId);
          notifMeta[spikeId] = { type: "spike", pct: spikePct };
        }
      }
    }
  } catch { /* non-critical */ }

  // ── 2. Hane görev bildirimleri ───────────────────────────────────────────────
  if (currentUser?.role === "household") {
    try {
      const res = await fetch("/api/households/tasks", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const body  = await res.json();
        const tasks = body?.data?.tasks ?? body?.tasks ?? [];

        tasks.forEach(t => {
          const isMyTask   = t.assigned_to === currentUser.id || t.assigned_to === null;
          const isActive   = t.status === "pending" || t.status === "in_progress";
          const iAssigned  = t.assigned_by === currentUser.id;

          // Atanan görev
          if (isActive && isMyTask) {
            const id = `task_${t.id}`;
            activeIds.add(id);
            notifMeta[id] = { type: "assigned", title: t.title, assignedBy: t.assigned_by_name || "Yönetici" };
          }

          // Son tarihi yaklaşıyor (3 gün)
          if (isActive && isMyTask && t.due_date && t.due_date >= today && t.due_date <= in3Days) {
            const id = `due_soon_${t.id}`;
            activeIds.add(id);
            notifMeta[id] = { type: "due_soon", title: t.title, dueDate: t.due_date };
          }

          // Yönetici: üye görevi tamamladı
          if (t.status === "completed" && iAssigned && t.assigned_to && t.assigned_to !== currentUser.id) {
            const id = `task_done_${t.id}`;
            activeIds.add(id);
            notifMeta[id] = { type: "done", title: t.title, assigneeName: t.assigned_to_name || "Üye" };
          }
        });
      }
    } catch { /* non-critical */ }
  }

  // ── 3. Şirket görev bildirimleri (son tarih) ─────────────────────────────────
  if (currentUser?.role === "company") {
    try {
      const res = await fetch("/api/company/tasks", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const body  = await res.json();
        const tasks = body?.data?.tasks ?? body?.tasks ?? [];

        tasks.forEach(t => {
          if ((t.status === "pending" || t.status === "in_progress") &&
              t.due_date && t.due_date >= today && t.due_date <= in3Days) {
            const id = `co_due_soon_${t.id}`;
            activeIds.add(id);
            notifMeta[id] = { type: "due_soon", title: t.title, dueDate: t.due_date };
          }
        });
      }
    } catch { /* non-critical */ }
  }

  // ── Kalıcı durum senkronizasyonu ────────────────────────────────────────────
  const state = _readNotifState();
  let changed = false;

  for (const id of activeIds) {
    const entry = state[id];
    if (id === "no_entry_this_month") {
      if (!entry || entry.month !== thisMonth) {
        state[id] = { read: false, month: thisMonth };
        changed = true;
      }
    } else if (id.startsWith("carbon_spike_")) {
      if (!entry) { state[id] = { read: false, month: thisMonth }; changed = true; }
      else if (entry.month !== thisMonth) { state[id] = { read: false, month: thisMonth }; changed = true; }
    } else {
      // task_*, due_soon_*, task_done_*, co_due_soon_*
      if (!entry) { state[id] = { read: false }; changed = true; }
    }
  }

  for (const id of Object.keys(state)) {
    if (!activeIds.has(id)) { delete state[id]; changed = true; }
  }

  if (changed) _writeNotifState(state);

  // ── Bildirim listesini oluştur ───────────────────────────────────────────────
  const notifications = [];

  if (state["no_entry_this_month"]) {
    notifications.push({
      id: "no_entry_this_month", type: "reminder",
      title: "Aylık Kayıt Eksik",
      desc:  `${now.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })} için henüz emisyon kaydı eklemediniz.`,
      date: new Date().toISOString(), read: state["no_entry_this_month"].read,
    });
  }

  const spikeId = `carbon_spike_${thisMonth}`;
  if (state[spikeId]) {
    notifications.push({
      id: spikeId, type: "warning",
      title: "Karbon Artışı Tespit Edildi",
      desc:  `Bu ay karbon salımın geçen aya göre %${notifMeta[spikeId]?.pct || ""} arttı.`,
      date: new Date().toISOString(), read: state[spikeId].read,
    });
  }

  for (const [id, meta] of Object.entries(notifMeta)) {
    if (!state[id]) continue;
    if (meta.type === "assigned") {
      notifications.push({
        id, type: "task",
        title: "Yeni Görev Atandı",
        desc:  `"${meta.title}" görevi ${meta.assignedBy} tarafından sana atandı.`,
        date: new Date().toISOString(), read: state[id].read,
      });
    } else if (meta.type === "due_soon") {
      notifications.push({
        id, type: "warning",
        title: "Görev Son Tarihi Yaklaşıyor",
        desc:  `"${meta.title}" görevinin son tarihi ${new Date(meta.dueDate).toLocaleDateString("tr-TR")}.`,
        date: new Date().toISOString(), read: state[id].read,
      });
    } else if (meta.type === "done") {
      notifications.push({
        id, type: "success",
        title: "Görev Tamamlandı",
        desc:  `"${meta.title}" görevi ${meta.assigneeName} tarafından tamamlandı.`,
        date: new Date().toISOString(), read: state[id].read,
      });
    }
  }

  if (notifications.length === 0) return;

  const unread = notifications.filter(n => !n.read).length;
  if (badge) badge.textContent = unread > 0 ? String(unread) : "";
  dropdown.innerHTML = buildNotificationDropdown(notifications);

  dropdown.querySelectorAll(".notification-item.unread").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      if (id) _markNotifRead(id);
    });
  });
}

async function _loadTopbarGamification() {
  try {
    const token =
      localStorage.getItem("emission_token") ||
      sessionStorage.getItem("emission_token");
    const res = await fetch("/api/gamification/stats", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const body = await res.json();
    const stats = body?.data;
    if (!stats) return;

    const tbStreak = document.getElementById("topbarStreakWidget");
    const tbCount = document.getElementById("topbarStreakCount");
    if (tbStreak && stats.current_streak > 0) {
      tbStreak.style.display = "flex";
      if (tbCount) tbCount.textContent = stats.current_streak;
    }
    const tbXp = document.getElementById("topbarXpWidget");
    const tbLevel = document.getElementById("topbarLevel");
    const tbFill = document.getElementById("topbarXpFill");
    if (tbXp) {
      tbXp.style.display = "flex";
      if (tbLevel) tbLevel.textContent = `Sv.${stats.level}`;
      if (tbFill)
        requestAnimationFrame(() => {
          tbFill.style.width = `${stats.level_progress_pct}%`;
        });
    }
  } catch {
    /* non-critical */
  }
}
