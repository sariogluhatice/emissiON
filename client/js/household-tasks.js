import { householdService } from "./api/householdService.js";
import { renderLayout }     from "./layout.js";
import {
  showToast,
  formatDate,
  getTaskStatusLabel,
  getTaskStatusClass,
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
    not_started: "Görev henüz başlamadı",
    no_data:     "Takip Ediliyor",
    on_track:    "Hedefe Uygun İlerliyor",
    at_risk:     "Dikkat: Hedef Aşılabilir",
    off_track:   "Limit Aşıldı",
    successful:  "Hedefe Ulaşıldı",
    failed:      "Hedef Tam Tutmadı",
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

  // A: No baseline
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

  const baseline = parseFloat(t.baseline_amount);
  const target   = parseFloat(t.target_amount);
  const hasCurrent = t.current_amount != null && t.progress_status !== "no_data";
  const current  = hasCurrent ? parseFloat(t.current_amount) : null;

  // B: Baseline but no current period
  if (current === null) {
    return `
      <div class="hh-task-progress">
        <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:4px;">
          Başlangıç: <strong>${baseline.toFixed(1)} kg</strong> → Hedef: <strong>${target.toFixed(1)} kg</strong>
        </div>
        <div class="hh-prog-badge" style="background:var(--color-warning-soft);color:#d97706;">
          🟡 Takip Ediliyor
        </div>
        <button class="hh-prog-cta" data-category="${t.emission_category}" data-mode="current">
          Güncel ${catLabel} Kaydı Ekle
        </button>
      </div>`;
  }

  // C: Full data
  const progCol = PROG_COLORS[t.progress_status] || { color: "var(--color-text-muted)", bg: "var(--color-surface-muted)" };
  let barPct = 0;
  if (baseline > target) {
    barPct = Math.max(0, Math.min(100,
      Math.round(((baseline - current) / (baseline - target)) * 100)
    ));
  }
  const achievedPct = baseline > 0
    ? Math.round(((baseline - current) / baseline) * 100)
    : null;

  const offTrackAlert = (t.progress_status === "off_track" || t.progress_status === "failed")
    ? `<div class="hh-task-alert">⚠️ Bu görev hedeften uzaklaşıyor!</div>`
    : "";

  return `
    <div class="hh-task-progress">
      ${offTrackAlert}
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-text-muted);margin-bottom:4px;">
        <span>Başlangıç: <strong>${baseline.toFixed(1)} kg</strong></span>
        <span>Hedef: <strong>${target.toFixed(1)} kg</strong></span>
        <span>Güncel: <strong>${current.toFixed(1)} kg</strong></span>
      </div>
      <div class="hh-prog-bar-track">
        <div class="hh-prog-bar-fill" style="width:${barPct}%;background:${progCol.color};"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
        <span class="hh-prog-badge" style="background:${progCol.bg};color:${progCol.color};">
          ${progEmoji(t.progress_status)} ${progLabel(t.progress_status)}
        </span>
        ${achievedPct !== null
          ? `<span style="font-size:11px;color:var(--color-text-muted);">İlerleme: <strong>${achievedPct}%</strong></span>`
          : ""}
      </div>
    </div>`;
}

// ── Status action (member vs admin) ──────────────────────────────────────────
function buildStatusAction(t) {
  if (_isAdmin) {
    const options = [
      ["pending",     getTaskStatusLabel("pending")],
      ["in_progress", getTaskStatusLabel("in_progress")],
      ["completed",   getTaskStatusLabel("completed")],
      ["cancelled",   getTaskStatusLabel("cancelled")],
    ].map(([v, l]) =>
      `<option value="${v}"${t.status === v ? " selected" : ""}>${l}</option>`
    ).join("");

    return `<select class="hh-status-select" data-task-id="${t.id}" data-status="${t.status}">
      ${options}
    </select>`;
  }

  // Member: only their own assigned tasks can transition
  const isAssigned = t.assigned_to && parseInt(t.assigned_to, 10) === parseInt(_myUserId, 10);
  const MEMBER_TRANSITIONS = { pending: "in_progress", in_progress: "completed" };
  const nextStatus = MEMBER_TRANSITIONS[t.status];

  if (isAssigned && nextStatus) {
    const btnLabel = nextStatus === "in_progress" ? "Başlat" : "Tamamlandı İşaretle";
    const btnStyle = nextStatus === "completed"
      ? "background:var(--color-primary);color:#fff;"
      : "background:var(--color-surface-blue);color:var(--color-secondary-hover);";
    return `<button class="hh-member-action-btn" data-task-id="${t.id}" data-status="${nextStatus}"
                    style="${btnStyle}">${btnLabel}</button>`;
  }

  // Static badge
  const cls = getTaskStatusClass(t.status);
  return `<span class="status-badge ${cls}">${getTaskStatusLabel(t.status)}</span>`;
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

  return `
    <div class="hh-task-card${isDimmed ? " hh-task-card--dim" : ""}" data-task-id="${t.id}">
      <div class="hh-task-card-top">
        <span class="status-badge ${statusCls}">${getTaskStatusLabel(t.status)}</span>
        <span class="hh-task-assignee-chip">${assignee}</span>
      </div>

      <h3 class="hh-task-card-title">${t.title}</h3>
      ${desc}

      ${buildProgressSection(t)}

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
  const counts = { all: _allTasks.length, pending: 0, in_progress: 0, completed: 0, mine: 0 };
  _allTasks.forEach(t => {
    if (counts[t.status] !== undefined) counts[t.status]++;
    if (t.assigned_to && parseInt(t.assigned_to, 10) === parseInt(_myUserId, 10)) counts.mine++;
  });
  document.getElementById("fcAll").textContent        = counts.all       || "";
  document.getElementById("fcPending").textContent    = counts.pending   || "";
  document.getElementById("fcInProgress").textContent = counts.in_progress || "";
  document.getElementById("fcCompleted").textContent  = counts.completed || "";
  document.getElementById("fcMine").textContent       = counts.mine      || "";
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
        <div class="hh-empty-icon">✅</div>
        <p>${emptyMsg}</p>
      </div>`;
    return;
  }

  tasksContainer.innerHTML = `<div class="hh-task-cards-grid">${tasks.map(taskCard).join("")}</div>`;

  // Bind admin status select
  tasksContainer.querySelectorAll(".hh-status-select").forEach(sel => {
    sel.addEventListener("change", () => handleStatusChange(sel.dataset.taskId, sel.value, sel.dataset.status, sel));
  });

  // Bind member action buttons
  tasksContainer.querySelectorAll(".hh-member-action-btn").forEach(btn => {
    btn.addEventListener("click", () => handleMemberAction(btn));
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
    await householdService.updateTaskStatus(taskId, status);
    showToast("Güncellendi", `Görev durumu: ${getTaskStatusLabel(status)}`, "success");
    await loadTasks();
  } catch (err) {
    showToast("Hata", err.message, "error");
    selectEl.value    = prevStatus;
    selectEl.disabled = false;
  }
}

// ── Status change (member button) ─────────────────────────────────────────────
async function handleMemberAction(btn) {
  const taskId = btn.dataset.taskId;
  const status = btn.dataset.status;
  btn.disabled    = true;
  btn.textContent = "…";
  try {
    await householdService.updateTaskStatus(taskId, status);
    showToast("Güncellendi", `Görev durumu: ${getTaskStatusLabel(status)}`, "success");
    await loadTasks();
  } catch (err) {
    showToast("Hata", err.message, "error");
    btn.disabled    = false;
    btn.textContent = status === "completed" ? "Tamamlandı İşaretle" : "Başlat";
  }
}

// ── Load tasks ────────────────────────────────────────────────────────────────
async function loadTasks() {
  tasksContainer.innerHTML = `<div class="hh-loading">Yükleniyor…</div>`;
  try {
    const res  = await householdService.getTasks();
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
    const res = await householdService.getMe();
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
