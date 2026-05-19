import { householdService } from "./api/householdService.js";
import { renderLayout }     from "./layout.js";
import { showToast }        from "./utils/uiUtils.js";

const user = renderLayout({ activeNav: "nav-household", title: "Yeni Görev Oluştur" });
if (!user) throw new Error("redirect");

// ── DOM refs ──────────────────────────────────────────────────────────────────
const taskTitleEl    = document.getElementById("taskTitle");
const taskDescEl     = document.getElementById("taskDesc");
const taskAssigneeEl = document.getElementById("taskAssignee");
const taskDueDateEl  = document.getElementById("taskDueDate");
const taskReductEl   = document.getElementById("taskReduction");
const taskEmCatEl    = document.getElementById("taskEmCat");
const taskTargetPctEl = document.getElementById("taskTargetPct");
const createTaskBtn  = document.getElementById("createTaskBtn");
const noRecordsModal = document.getElementById("noRecordsModal");
const noRecordsVazgecBtn = document.getElementById("noRecordsVazgecBtn");

// ── No-records modal ──────────────────────────────────────────────────────────
noRecordsVazgecBtn?.addEventListener("click", () => {
  if (noRecordsModal) noRecordsModal.style.display = "none";
});
noRecordsModal?.addEventListener("click", (e) => {
  if (e.target === noRecordsModal) noRecordsModal.style.display = "none";
});

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

// ── Create task ───────────────────────────────────────────────────────────────
createTaskBtn?.addEventListener("click", async () => {
  const title = taskTitleEl?.value.trim();
  if (!title) {
    showToast("Hata", "Görev başlığı gereklidir.", "error");
    taskTitleEl?.focus();
    return;
  }

  const emCat    = taskEmCatEl?.value || "";
  const targetPct = taskTargetPctEl?.value || "";

  if ((emCat && !targetPct) || (!emCat && targetPct)) {
    showToast("Hata", "Emisyon kategorisi ve azaltım hedefi birlikte girilmelidir.", "error");
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
    description:       taskDescEl?.value.trim()  || undefined,
    assigned_to:       taskAssigneeEl?.value      || undefined,
    due_date:          taskDueDateEl?.value        || undefined,
    target_reduction:  taskReductEl?.value         || undefined,
    emission_category: emCat                       || undefined,
    target_pct:        targetPct                   || undefined,
  };

  createTaskBtn.disabled    = true;
  createTaskBtn.textContent = "Oluşturuluyor…";
  try {
    await householdService.createTask(payload);
    showToast("Başarılı", "Görev oluşturuldu.", "success");
    setTimeout(() => { window.location.href = "household-tasks.html"; }, 600);
  } catch (err) {
    if (err.message?.includes("en az bir emisyon kaydı")) {
      if (noRecordsModal) noRecordsModal.style.display = "flex";
    } else {
      showToast("Hata", err.message, "error");
    }
    createTaskBtn.disabled    = false;
    createTaskBtn.textContent = "Görev Oluştur";
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  if (taskDueDateEl) taskDueDateEl.min = new Date().toISOString().split("T")[0];

  // Admin guard: members can't create tasks
  try {
    const res = await householdService.getMe();
    const h   = res.data?.household;
    if (!h) {
      window.location.href = "household.html";
      return;
    }
    if (h.role !== "admin") {
      window.location.href = "household-tasks.html";
      return;
    }
    await loadMembers();
  } catch (err) {
    showToast("Hata", err.message, "error");
  }
})();
