import { householdApi } from "./api/householdApi.js";
import { renderLayout }     from "./layout.js";
import {
  showToast,
  formatDate,
  getTaskStatusLabel,
  getTaskStatusClass,
  buildTaskStatusOptions,
} from "./utils/uiUtils.js";
import { getCategoryLabel } from "./utils/labelUtils.js";

const user = renderLayout({ activeNav: "nav-household", title: "Hane Görevleri" });
if (!user) throw new Error("redirect");

// ── DOM refs ──────────────────────────────────────────────────────────────────
const tasksContainer = document.getElementById("tasksContainer");
const filterBar      = document.getElementById("filterBar");
const newTaskBtn     = document.getElementById("newTaskBtn");
const filterMineBtn  = document.getElementById("filterMine");
const pageSubtitle   = document.getElementById("pageSubtitle");

// ── State ─────────────────────────────────────────────────────────────────────
let _allTasks   = [];
let _isAdmin    = false;
let _myUserId   = user.id;
let _filter     = "all";
let _addDataCat = null;

// ── Add-data modal ────────────────────────────────────────────────────────────
const addDataModal   = document.getElementById("addDataModal");
const addDataTitle   = document.getElementById("addDataTitle");
const addDataMsg     = document.getElementById("addDataMsg");
const addDataConfirm = document.getElementById("addDataConfirm");
document.getElementById("addDataCancel")?.addEventListener("click", () => {
  addDataModal.style.display = "none";
});
addDataModal?.addEventListener("click", (e) => {
  if (e.target === addDataModal) addDataModal.style.display = "none";
});
addDataConfirm?.addEventListener("click", () => {
  window.location.href = `add-entry.html${_addDataCat ? `?category=${_addDataCat}` : ""}`;
});

function showAddDataModal(cat, mode) {
  _addDataCat = cat;
  const catLabel = getCategoryLabel(cat);
  if (mode === "current") {
    addDataTitle.textContent = "Bu Döneme Kayıt Eksik";
    addDataMsg.textContent   = `Başlangıç verisi var, ancak güncel dönem kaydı bulunamadı. İlerlemeyi hesaplamak için bu döneme ait ${catLabel} kaydı ekleyin.`;
  } else {
    addDataTitle.textContent = "Görev İlerlemesi İçin Veri Gerekli";
    addDataMsg.textContent   = `"${catLabel}" kategorisinde kayıt bulunamadı. Şimdi veri eklemek ister misiniz?`;
  }
  addDataModal.style.display = "flex";
}

// ── Progress colors / labels ──────────────────────────────────────────────────
// bg uses rgba so ${color}18 hex-alpha trick is not needed (works in dark mode)
const PROG_COLORS = {
  not_started: { color: "var(--color-text-muted)", bg: "var(--color-surface-muted)" },
  on_track:    { color: "#16a34a", bg: "rgba(22,163,74,0.12)"  },
  at_risk:     { color: "#d97706", bg: "rgba(217,119,6,0.10)"  },
  off_track:   { color: "#ef4444", bg: "rgba(239,68,68,0.10)"  },
  failed:      { color: "#ef4444", bg: "rgba(239,68,68,0.10)"  },
  successful:  { color: "#16a34a", bg: "rgba(22,163,74,0.12)"  },
};

function progLabel(status) {
  return {
    not_started: "Henüz Başlamadı",
    no_data:     "Takip Ediliyor",
    on_track:    "Hedefe Uygun İlerliyor",
    at_risk:     "Dikkat: Hedef Aşılabilir",
    off_track:   "Limit Aşıldı",
    successful:  "Hedefe Ulaşıldı",
    failed:      "Hedef Tutmadı",
  }[status] || "—";
}

function progEmoji(status) {
  return { not_started: "⏸️", on_track: "🟢", at_risk: "🟡", off_track: "🔴", failed: "🔴", successful: "🏆" }[status] || "🟡";
}

// ── Deadline urgency ──────────────────────────────────────────────────────────
function dueDateHtml(dateStr) {
  if (!dateStr) return `<span style="color:var(--color-text-muted);font-size:12px;">Son tarih yok</span>`;
  const today     = new Date();
  today.setHours(0,0,0,0);
  const due       = new Date(dateStr);
  const diffDays  = Math.round((due - today) / 86400000);
  let color = "var(--color-text-muted)";
  let suffix = "";
  if (diffDays < 0) {
    color = "var(--color-error)"; suffix = " (Geçti)";
  } else if (diffDays === 0) {
    color = "var(--color-error)"; suffix = " (Bugün!)";
  } else if (diffDays <= 3) {
    color = "#f59e0b"; suffix = ` (${diffDays} gün)`;
  } else if (diffDays <= 7) {
    color = "#f59e0b"; suffix = ` (${diffDays} gün)`;
  }
  return `<span style="color:${color};font-size:12px;font-weight:${diffDays <= 3 ? 700 : 400};">
    ${formatDate(dateStr)}${suffix}
  </span>`;
}

// ── Progress section (inside card) ───────────────────────────────────────────
function buildProgressSection(t) {
  if (!t.emission_category) return "";

  const catLabel = getCategoryLabel(t.emission_category);

  // A: No baseline at all
  if (t.target_amount == null) {
    return `
      <div class="hh-task-progress">
        <div class="hh-prog-badge" style="background:var(--color-error-soft);color:var(--color-error);">
          🔴 Başlangıç Kaydı Yok
        </div>
        <button class="hh-prog-cta" data-category="${t.emission_category}" data-mode="baseline">
          ${catLabel} Verisi Ekle
        </button>
      </div>`;
  }

  const baseline     = parseFloat(t.baseline_amount);
  const periodTarget = t.period_target != null ? parseFloat(t.period_target) : null;
  // null = gerçekten kayıt yok; 0 veya pozitif = kayıt var (COALESCE döner)
  const current      = t.current_amount != null ? parseFloat(t.current_amount) : null;
  const hasRecords   = current !== null && current > 0;

  const isNotStarted = t.progress_status === "not_started";
  const hasStatus    = hasRecords && t.progress_status && t.progress_status !== "no_data";
  const progCol      = hasStatus
    ? (PROG_COLORS[t.progress_status] || { color: "var(--color-text-muted)", bg: "var(--color-surface-muted)" })
    : { color: "#d97706", bg: "rgba(217,119,6,0.10)" };

  // Bar: 0 for not_started; otherwise current / period_target
  let barPct = 0;
  if (!isNotStarted && hasRecords && periodTarget !== null && periodTarget > 0) {
    barPct = Math.max(0, Math.min(100, Math.round(current / periodTarget * 100)));
  }

  // "12.4 / 30.1 kg"  →  kayıt varsa; "0 / 30.1 kg"  →  kayıt yoksa
  const displayCurrent = current !== null ? current : 0;
  const currentStr = periodTarget !== null
    ? `${displayCurrent.toFixed(1)} / ${periodTarget.toFixed(1)} kg`
    : `${displayCurrent.toFixed(1)} kg`;

  const remainingHtml = periodTarget !== null
    ? `<div style="font-size:11px;color:var(--color-text-muted);">Kalan: <strong>${Math.max(0, periodTarget - displayCurrent).toFixed(1)} kg</strong></div>`
    : "";

  const offTrackAlert = (t.progress_status === "off_track" || t.progress_status === "failed")
    ? `<div class="hh-task-alert">⚠️ Bu görev hedeften uzaklaşıyor!</div>`
    : "";

  const statusBadge = hasStatus
    ? `<span class="hh-prog-badge" style="background:${progCol.bg};color:${progCol.color};">
         ${progEmoji(t.progress_status)} ${progLabel(t.progress_status)}
       </span>`
    : `<span class="hh-prog-badge" style="background:rgba(217,119,6,0.10);color:#d97706;">🟡 Takip Ediliyor</span>`;

  // CTA: sadece kayıt yoksa göster
  const ctaBtn = !hasRecords
    ? `<button class="hh-prog-cta" data-category="${t.emission_category}" data-mode="current">
         Güncel ${catLabel} Kaydı Ekle
       </button>`
    : "";

  return `
    <div class="hh-task-progress">
      ${offTrackAlert}
      <div style="font-size:11px;color:var(--color-text-muted);display:flex;flex-direction:column;gap:3px;margin-bottom:6px;">
        <div>Aylık Baz: <strong>${baseline.toFixed(1)} kg</strong></div>
        ${periodTarget !== null ? `<div>Dönem Hedefi: <strong>${periodTarget.toFixed(1)} kg</strong></div>` : ""}
        <div>Güncel: <strong style="color:${hasRecords ? "var(--color-text)" : "var(--color-text-muted)"};">${currentStr}</strong></div>
        ${remainingHtml}
      </div>
      <div class="hh-prog-bar-track">
        <div class="hh-prog-bar-fill" style="width:${barPct}%;background:${progCol.color};"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
        ${statusBadge}
      </div>
      ${ctaBtn}
    </div>`;
}

// ── Status action (admin & assigned member: same constrained dropdown) ───────
function buildStatusAction(t) {
  const isAssigned = t.assigned_to && parseInt(t.assigned_to, 10) === parseInt(_myUserId, 10);
  const canEdit    = _isAdmin || isAssigned;

  const selectOptions = buildTaskStatusOptions(t.status);

  if (canEdit && selectOptions) {
    return `<select class="hh-status-select" data-task-id="${t.id}" data-status="${t.status}">${selectOptions}</select>`;
  }

  return `<span class="status-badge ${getTaskStatusClass(t.status)}">${getTaskStatusLabel(t.status)}</span>`;
}

// ── Task card ─────────────────────────────────────────────────────────────────
function taskCard(t) {
  const isCompleted  = t.status === "completed";
  const isCancelled  = t.status === "cancelled";
  const isDimmed     = isCompleted || isCancelled;
  const assignee     = t.assigned_to_name ? `👤 ${t.assigned_to_name}` : "🏠 Tüm Hane";
  const reduction    = t.target_reduction
    ? `<span style="font-size:11px;color:var(--color-text-muted);">Hedef: ${parseFloat(t.target_reduction).toFixed(1)} kg CO₂</span>`
    : "";
  const desc = t.description
    ? `<p class="hh-task-card-desc">${t.description}</p>`
    : "";
  const statusCls = getTaskStatusClass(t.status);
  const catChip = t.emission_category
    ? `<span class="hh-task-assignee-chip">${getCategoryLabel(t.emission_category)}</span>`
    : `<span class="hh-task-assignee-chip">${assignee}</span>`;
  const assigneeRow = t.emission_category
    ? `<div style="font-size:11px;color:var(--color-text-muted);">${assignee}</div>`
    : "";

  return `
    <div class="hh-task-card${isDimmed ? " hh-task-card--dim" : ""}" data-task-id="${t.id}">
      <div class="hh-task-card-top">
        <span class="status-badge ${statusCls}">${getTaskStatusLabel(t.status)}</span>
        ${catChip}
      </div>

      <h3 class="hh-task-card-title">${t.title}</h3>
      ${assigneeRow}
      ${desc}

      ${isCancelled ? "" : buildProgressSection(t)}

      <div class="hh-task-card-footer">
        <div style="display:flex;flex-direction:column;gap:2px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 style="flex-shrink:0;color:var(--color-text-muted);">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            ${dueDateHtml(t.due_date)}
          </div>
          ${reduction}
        </div>
        <div class="hh-task-card-action">
          ${buildStatusAction(t)}
        </div>
      </div>
    </div>`;
}

// ── Filter logic ──────────────────────────────────────────────────────────────
function filteredTasks() {
  if (_filter === "all")         return _allTasks;
  if (_filter === "mine")        return _allTasks.filter(t =>
    t.assigned_to && parseInt(t.assigned_to, 10) === parseInt(_myUserId, 10)
  );
  return _allTasks.filter(t => t.status === _filter);
}

function updateFilterCounts() {
  const counts = { all: _allTasks.length, pending: 0, in_progress: 0, completed: 0, cancelled: 0, mine: 0 };
  _allTasks.forEach(t => {
    if (counts[t.status] !== undefined) counts[t.status]++;
    if (t.assigned_to && parseInt(t.assigned_to, 10) === parseInt(_myUserId, 10)) counts.mine++;
  });
  document.getElementById("fcAll").textContent         = counts.all         || "";
  document.getElementById("fcPending").textContent     = counts.pending     || "";
  document.getElementById("fcInProgress").textContent  = counts.in_progress || "";
  document.getElementById("fcCompleted").textContent   = counts.completed   || "";
  document.getElementById("fcCancelled").textContent   = counts.cancelled   || "";
  document.getElementById("fcMine").textContent        = counts.mine        || "";
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTasks() {
  const tasks = filteredTasks();

  if (!tasks.length) {
    const emptyMsg = _filter === "mine"
      ? "Size atanmış görev bulunmuyor."
      : _filter === "all"
        ? _isAdmin
          ? 'Henüz görev oluşturulmadı. <a href="create-household-task.html" style="color:var(--color-primary);text-decoration:underline;">İlk görevi oluşturun.</a>'
          : "Henüz görev oluşturulmadı."
        : "Bu filtreye uygun görev yok.";

    tasksContainer.innerHTML = `
      <div class="hh-empty">
        <div class="hh-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-muted); opacity: 0.7;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <p>${emptyMsg}</p>
      </div>`;
    return;
  }

  tasksContainer.innerHTML = `<div class="hh-task-cards-grid">${tasks.map(taskCard).join("")}</div>`;

  tasksContainer.querySelectorAll(".hh-status-select").forEach(sel => {
    sel.addEventListener("change", () => handleStatusChange(sel.dataset.taskId, sel.value, sel.dataset.status, sel));
  });

  // Bind add-data CTA buttons
  tasksContainer.querySelectorAll(".hh-prog-cta").forEach(btn => {
    btn.addEventListener("click", () => showAddDataModal(btn.dataset.category, btn.dataset.mode));
  });
}

// ── Status change (admin dropdown) ───────────────────────────────────────────
async function handleStatusChange(taskId, status, prevStatus, selectEl) {
  selectEl.disabled = true;
  try {
    await householdApi.updateTaskStatus(taskId, status);
    showToast("Güncellendi", `Görev durumu: ${getTaskStatusLabel(status)}`, "success");
    await loadTasks();
  } catch (err) {
    showToast("Hata", err.message, "error");
    selectEl.value    = prevStatus;
    selectEl.disabled = false;
  }
}

// ── Load tasks ────────────────────────────────────────────────────────────────
async function loadTasks() {
  tasksContainer.innerHTML = `<div class="hh-loading">Yükleniyor…</div>`;
  try {
    const res  = await householdApi.getTasks();
    _allTasks  = res.data?.tasks ?? [];
    updateFilterCounts();
    renderTasks();
  } catch (err) {
    tasksContainer.innerHTML = `
      <div class="hh-empty"><p>Görevler yüklenemedi: ${err.message}</p></div>`;
  }
}

// ── Filter bar wiring ─────────────────────────────────────────────────────────
filterBar?.querySelectorAll(".hh-filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    filterBar.querySelectorAll(".hh-filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    _filter = btn.dataset.filter;
    renderTasks();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const res = await householdApi.getMe();
    const h   = res.data?.household;

    if (!h) {
      window.location.href = "household.html";
      return;
    }

    _isAdmin = h.role === "admin";

    if (_isAdmin) {
      if (newTaskBtn) newTaskBtn.style.display = "";
      if (pageSubtitle) pageSubtitle.textContent = "Görevleri yönetin ve üye ilerlemelerini takip edin.";
    } else {
      if (filterMineBtn) filterMineBtn.style.display = "";
    }

    if (filterBar) filterBar.style.display = "";

    await loadTasks();
  } catch (err) {
    showToast("Hata", err.message, "error");
  }
})();
