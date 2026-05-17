import { householdService } from "./api/householdService.js";
import { renderLayout } from "./layout.js";
import {
  showToast,
  formatDate,
  getTaskStatusLabel,
  getTaskStatusClass,
} from "./utils/uiUtils.js";
import { getCategoryLabel } from "./utils/labelUtils.js";

const user = renderLayout({
  activeNav: "nav-household",
  title: "Hane Görevleri",
});
if (!user) throw new Error("redirect");

// ── DOM refs ──────────────────────────────────────────────────────────────────
const taskTitleEl = document.getElementById("taskTitle");
const taskDescEl = document.getElementById("taskDesc");
const taskAssigneeEl = document.getElementById("taskAssignee");
const taskDueDateEl = document.getElementById("taskDueDate");
const taskReductEl = document.getElementById("taskReduction");
const taskEmCatEl = document.getElementById("taskEmCat");
const taskTargetPctEl = document.getElementById("taskTargetPct");
const createTaskBtn = document.getElementById("createTaskBtn");
const tasksContainer = document.getElementById("tasksContainer");
const taskCountEl = document.getElementById("taskCountEl");
const noRecordsModal = document.getElementById("noRecordsModal");
const noRecordsVazgecBtn = document.getElementById("noRecordsVazgecBtn");

// ── Progress status display ───────────────────────────────────────────────────
const PROG_COLORS = {
  on_track: "var(--color-primary)",
  at_risk: "#f59e0b",
  off_track: "var(--color-error)",
  successful: "#16a34a",
  failed: "var(--color-error)",
};

// ── No-records modal (task creation flow) ─────────────────────────────────────
function showNoRecordsModal() {
  if (noRecordsModal) noRecordsModal.style.display = "flex";
}
function hideNoRecordsModal() {
  if (noRecordsModal) noRecordsModal.style.display = "none";
}
noRecordsVazgecBtn?.addEventListener("click", hideNoRecordsModal);
noRecordsModal?.addEventListener("click", (e) => {
  if (e.target === noRecordsModal) hideNoRecordsModal();
});

// ── Add-data modal (task progress CTA) ───────────────────────────────────────
let _addDataModal = null;
let _addDataCatKey = null;

// mode: 'baseline' = no data at all; 'current' = baseline exists, this period missing
function showAddDataModal(categoryKey, mode = "baseline") {
  _addDataCatKey = categoryKey;
  if (!_addDataModal) {
    _addDataModal = document.createElement("div");
    _addDataModal.className = "modal-backdrop";
    _addDataModal.innerHTML = `
      <div class="modal-box glass-card" style="max-width:460px;width:100%;">
        <h2 class="modal-title" id="_addDataTitle"></h2>
        <p class="modal-body"   id="_addDataMsg"></p>
        <div class="modal-actions">
          <button class="btn-secondary" id="_addDataCancel">İptal</button>
          <button class="btn-primary"   id="_addDataConfirm">Kayıt Ekle</button>
        </div>
      </div>`;
    document.body.appendChild(_addDataModal);
    document.getElementById("_addDataCancel").addEventListener("click", () => {
      _addDataModal.style.display = "none";
    });
    _addDataModal.addEventListener("click", (e) => {
      if (e.target === _addDataModal) _addDataModal.style.display = "none";
    });
    document.getElementById("_addDataConfirm").addEventListener("click", () => {
      window.location.href = `add-entry.html?category=${_addDataCatKey}`;
    });
  }
  const catLabel = getCategoryLabel(_addDataCatKey);
  const titleEl = document.getElementById("_addDataTitle");
  const msgEl = document.getElementById("_addDataMsg");
  if (mode === "current") {
    titleEl.textContent = "Bu Döneme Kayıt Eksik";
    msgEl.textContent = `Bu görev için başlangıç verisi var, ancak güncel dönem kaydı bulunamadı. İlerlemeyi hesaplamak için bu döneme ait ${catLabel} kaydı ekleyin.`;
  } else {
    titleEl.textContent = "Görev İlerlemesi İçin Veri Gerekli";
    msgEl.textContent = `Bu görev için "${catLabel}" kategorisinde kayıt bulunamadı. Şimdi veri eklemek ister misiniz?`;
  }
  _addDataModal.style.display = "flex";
}

// ── Admin guard ───────────────────────────────────────────────────────────────
async function guardAdmin() {
  const res = await householdService.getMe();
  const h = res.data?.household;
  if (!h || h.role !== "admin") {
    window.location.href = "household.html";
    throw new Error("not-admin");
  }
}

// ── Populate assignee dropdown ────────────────────────────────────────────────
async function loadMembers() {
  try {
    const res = await householdService.getMembers();
    const members = res.data?.members ?? [];
    members.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.user_id;
      opt.textContent = `👤 ${m.name || m.email}${m.role === "admin" ? " (Yönetici)" : ""}`;
      taskAssigneeEl.appendChild(opt);
    });
  } catch {
    // Members dropdown is optional — continue without it
  }
}

// ── Progress cell builder ─────────────────────────────────────────────────────
function buildProgressCell(t) {
  if (!t.emission_category) {
    return '<span style="color:var(--color-text-muted);font-size:12px;">—</span>';
  }

  const catLabel = getCategoryLabel(t.emission_category);
  const pctHint = t.target_pct
    ? ` · %${parseFloat(t.target_pct)} azaltım hedefi`
    : "";
  const catMeta = `
    <div style="font-size:11px;color:var(--color-text-muted);margin-top:6px;">
      ${catLabel}${pctHint}
    </div>`;

  // State A CTA: no data at all — add any entry to establish baseline
  const ctaBtnBaseline = `
    <button class="btn-add-data" data-category="${t.emission_category}" data-mode="baseline"
            style="margin-top:6px;font-size:11px;padding:4px 10px;
                   border:1px solid var(--color-primary);border-radius:6px;
                   background:transparent;color:var(--color-primary);
                   cursor:pointer;white-space:nowrap;">
      ${catLabel} Verisi Ekle
    </button>`;

  // State B CTA: baseline exists, add THIS PERIOD's entry only
  const ctaBtnCurrent = `
    <button class="btn-add-data" data-category="${t.emission_category}" data-mode="current"
            style="margin-top:6px;font-size:11px;padding:4px 10px;
                   border:1px solid var(--color-primary);border-radius:6px;
                   background:transparent;color:var(--color-primary);
                   cursor:pointer;white-space:nowrap;">
      Güncel ${catLabel} Kaydı Ekle
    </button>`;

  // ── A: No baseline yet ────────────────────────────────────────────────────
  if (t.target_amount == null) {
    const c = "var(--color-error)";
    return `
      <div style="min-width:200px;">
        <div style="display:inline-block;font-size:11px;font-weight:700;color:${c};
                    padding:3px 9px;border-radius:99px;background:#fef2f2;margin-bottom:5px;">
          🔴 Başlangıç Verisi Eksik
        </div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:2px;">
          İlerleme hesaplamak için bu kategoride başlangıç verisi gerekiyor.
        </div>
        ${ctaBtnBaseline}
        ${catMeta}
      </div>`;
  }

  const baseline = parseFloat(t.baseline_amount);
  const target = parseFloat(t.target_amount);

  // Backend returns null when no emission records exist this period (≠ zero emission).
  // Also guard against progress_status 'no_data' defensively.
  const hasCurrent =
    t.current_amount != null && t.progress_status !== "no_data";
  const current = hasCurrent ? parseFloat(t.current_amount) : null;

  // ── B: Has baseline + target, but no current-period records ──────────────
  if (current === null) {
    const c = "#f59e0b";
    return `
      <div style="min-width:200px;">
        <div style="font-size:12px;">Başlangıç: <strong>${baseline.toFixed(1)} kg CO₂e</strong></div>
        <div style="font-size:12px;margin:2px 0 6px;">Hedef: <strong>${target.toFixed(1)} kg CO₂e</strong></div>
        <div style="display:inline-block;font-size:11px;font-weight:700;color:${c};
                    padding:3px 9px;border-radius:99px;background:#fffbeb;margin-bottom:4px;">
          🟡 Güncel Veri Bekleniyor
        </div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:2px;">
          Bu dönem için güncel kayıt bulunamadı.
        </div>
        ${ctaBtnCurrent}
        ${catMeta}
      </div>`;
  }

  // ── C: Full data available ────────────────────────────────────────────────
  const color = PROG_COLORS[t.progress_status] || "var(--color-text-muted)";

  let progLabel, statusEmoji;
  if (t.progress_status === "successful") {
    progLabel = "Hedefe Ulaşıldı";
    statusEmoji = "🏆";
  } else if (t.progress_status === "on_track") {
    progLabel = "İlerliyor";
    statusEmoji = "🟢";
  } else if (t.progress_status === "at_risk") {
    progLabel = "Risk Altında";
    statusEmoji = "🟡";
  } else if (
    t.progress_status === "off_track" ||
    t.progress_status === "failed"
  ) {
    progLabel =
      t.progress_status === "failed" ? "Başarısız" : "Hedeften Uzaklaşıyor";
    statusEmoji = "🔴";
  } else {
    progLabel = "Değişim Yok";
    statusEmoji = "🟡";
  }

  let barPct = 0;
  if (baseline > target) {
    barPct = Math.max(
      0,
      Math.min(
        100,
        Math.round(((baseline - current) / (baseline - target)) * 100),
      ),
    );
  }

  const achievedPct =
    baseline > 0 ? Math.round(((baseline - current) / baseline) * 100) : null;

  return `
    <div style="min-width:200px;">
      <div style="font-size:12px;">Başlangıç: <strong>${baseline.toFixed(1)} kg CO₂e</strong></div>
      <div style="font-size:12px;margin:2px 0;">Hedef: <strong>${target.toFixed(1)} kg CO₂e</strong></div>
      <div style="font-size:12px;margin-bottom:4px;">Güncel: <strong>${current.toFixed(1)} kg CO₂e</strong></div>
      ${achievedPct !== null ? `<div style="font-size:11px;color:var(--color-text-muted);">İlerleme: <strong>${achievedPct}%</strong></div>` : ""}
      <div style="margin:5px 0 4px;">
        <div style="background:var(--color-border);border-radius:99px;height:5px;">
          <div style="width:${barPct}%;background:${color};height:100%;border-radius:99px;transition:width 0.3s;"></div>
        </div>
      </div>
      <span style="font-size:11px;font-weight:700;color:${color};padding:3px 9px;
                   border-radius:99px;background:${color}18;">
        ${statusEmoji} ${progLabel}
      </span>
      ${catMeta}
    </div>`;
}

// ── Task row ──────────────────────────────────────────────────────────────────
function taskRow(t) {
  const desc = t.description
    ? `<div style="font-size:12px;color:var(--color-text-muted);margin-top:2px;">${t.description}</div>`
    : "";

  const assignee = t.assigned_to_name
    ? `👤 ${t.assigned_to_name}`
    : "🏠 Tüm Hane";
  const dueDate = t.due_date ? formatDate(t.due_date) : "—";
  const reduction = t.target_reduction
    ? `${parseFloat(t.target_reduction).toFixed(1)} kg`
    : "—";

  const options = Object.entries({
    pending: getTaskStatusLabel("pending"),
    in_progress: getTaskStatusLabel("in_progress"),
    completed: getTaskStatusLabel("completed"),
    cancelled: getTaskStatusLabel("cancelled"),
  })
    .map(
      ([v, l]) =>
        `<option value="${v}"${t.status === v ? " selected" : ""}>${l}</option>`,
    )
    .join("");

  return `
    <tr data-task-id="${t.id}"
        data-emission-category="${t.emission_category || ""}"
        data-has-baseline="${t.target_amount != null}"
        data-progress-status="${t.progress_status || ""}">
      <td>
        <div style="font-weight:600;color:var(--color-text);">${t.title}</div>
        ${desc}
      </td>
      <td style="white-space:nowrap;font-size:13px;">${assignee}</td>
      <td style="text-align:right;font-size:13px;">${reduction}</td>
      <td style="font-size:13px;white-space:nowrap;">${dueDate}</td>
      <td>${buildProgressCell(t)}</td>
      <td>
        <select class="hh-status-select" data-task-id="${t.id}" data-status="${t.status}">
          ${options}
        </select>
      </td>
    </tr>`;
}

// ── Render tasks table ────────────────────────────────────────────────────────
function renderTasks(tasks) {
  if (taskCountEl) taskCountEl.textContent = `${tasks.length} görev`;

  if (!tasks.length) {
    tasksContainer.innerHTML = `
      <div class="hh-empty">
        <div class="hh-empty-icon">✅</div>
        <p>Henüz görev oluşturulmadı. Yukarıdaki formu kullanın.</p>
      </div>`;
    return;
  }

  tasksContainer.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="hh-tasks-table">
        <thead>
          <tr>
            <th style="min-width:200px;">Görev</th>
            <th style="min-width:130px;">Atanan</th>
            <th style="text-align:right">Hedef Azaltım</th>
            <th>Son Tarih</th>
            <th style="min-width:210px;">İlerleme</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map((t) => taskRow(t)).join("")}
        </tbody>
      </table>
    </div>`;

  tasksContainer.querySelectorAll(".hh-status-select").forEach((sel) => {
    sel.addEventListener("change", () => handleStatusChange(sel));
  });

  tasksContainer.querySelectorAll(".btn-add-data").forEach((btn) => {
    btn.addEventListener("click", () =>
      showAddDataModal(btn.dataset.category, btn.dataset.mode || "baseline"),
    );
  });
}

// ── Update task status ────────────────────────────────────────────────────────
async function handleStatusChange(selectEl) {
  const taskId = selectEl.dataset.taskId;
  const status = selectEl.value;
  const prevStatus = selectEl.dataset.status;

  // Confirm if marking terminal status when emission tracking data is incomplete
  const isTerminal = status === "completed" || status === "cancelled";
  if (isTerminal) {
    const row = selectEl.closest("tr");
    const hasEmCat = !!row?.dataset.emissionCategory;
    const hasBaseline = row?.dataset.hasBaseline === "true";
    const progStatus = row?.dataset.progressStatus;
    const dataMissing =
      hasEmCat &&
      (!hasBaseline ||
        progStatus === "no_data" ||
        progStatus === "no_baseline");
  }

  selectEl.disabled = true;
  try {
    await householdService.updateTaskStatus(taskId, status);
    showToast(
      "Güncellendi",
      `Görev durumu: ${getTaskStatusLabel(status)}`,
      "success",
    );
    selectEl.dataset.status = status;
  } catch (err) {
    showToast("Hata", err.message, "error");
    selectEl.value = prevStatus;
    await loadTasks();
  } finally {
    selectEl.disabled = false;
  }
}

// ── Load tasks ────────────────────────────────────────────────────────────────
async function loadTasks() {
  tasksContainer.innerHTML = `<div class="hh-loading">Yükleniyor…</div>`;
  try {
    const res = await householdService.getTasks();
    renderTasks(res.data?.tasks ?? []);
  } catch (err) {
    tasksContainer.innerHTML = `<div class="hh-empty"><p>Görevler yüklenemedi: ${err.message}</p></div>`;
  }
}

// ── Create task ───────────────────────────────────────────────────────────────
createTaskBtn?.addEventListener("click", async () => {
  const title = taskTitleEl?.value.trim();
  if (!title) {
    showToast("Hata", "Görev başlığı gereklidir.", "error");
    taskTitleEl?.focus();
    return;
  }

  const emCat = taskEmCatEl?.value || "";
  const targetPct = taskTargetPctEl?.value || "";

  if ((emCat && !targetPct) || (!emCat && targetPct)) {
    showToast(
      "Hata",
      "Emisyon kategorisi ve azaltım hedefi birlikte girilmelidir.",
      "error",
    );
    (emCat ? taskTargetPctEl : taskEmCatEl)?.focus();
    return;
  }
  if (targetPct) {
    const pct = parseFloat(targetPct);
    if (isNaN(pct) || pct < 1 || pct > 99) {
      showToast("Hata", "Azaltım hedefi 1 ile 99 arasında olmalıdır.", "error");
      taskTargetPctEl?.focus();
      return;
    }
  }

  const payload = {
    title,
    description: taskDescEl?.value.trim() || undefined,
    assigned_to: taskAssigneeEl?.value || undefined,
    due_date: taskDueDateEl?.value || undefined,
    target_reduction: taskReductEl?.value || undefined,
    emission_category: emCat || undefined,
    target_pct: targetPct || undefined,
  };

  createTaskBtn.disabled = true;
  createTaskBtn.textContent = "Oluşturuluyor…";
  try {
    await householdService.createTask(payload);
    showToast("Başarılı", "Görev oluşturuldu.", "success");

    taskTitleEl.value = "";
    taskDescEl.value = "";
    taskDueDateEl.value = "";
    taskReductEl.value = "";
    taskAssigneeEl.value = "";
    taskEmCatEl.value = "";
    taskTargetPctEl.value = "";

    await loadTasks();
  } catch (err) {
    if (err.message?.includes("en az bir emisyon kaydı")) {
      showNoRecordsModal();
    } else {
      showToast("Hata", err.message, "error");
    }
  } finally {
    createTaskBtn.disabled = false;
    createTaskBtn.textContent = "Görev Oluştur";
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  if (taskDueDateEl) taskDueDateEl.min = new Date().toISOString().split("T")[0];

  try {
    await guardAdmin();
    await Promise.all([loadMembers(), loadTasks()]);
  } catch (err) {
    if (err.message !== "not-admin") {
      showToast("Hata", err.message, "error");
    }
  }
})();
