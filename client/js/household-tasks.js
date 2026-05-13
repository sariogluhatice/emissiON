import { householdService } from './api/householdService.js';
import { renderLayout }     from './layout.js';
import { showToast, formatDate } from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-household', title: 'Hane Görevleri' });
if (!user) throw new Error('redirect');

// ── DOM refs ──────────────────────────────────────────────────────────────────
const taskTitleEl     = document.getElementById('taskTitle');
const taskDescEl      = document.getElementById('taskDesc');
const taskAssigneeEl  = document.getElementById('taskAssignee');
const taskDueDateEl   = document.getElementById('taskDueDate');
const taskReductEl    = document.getElementById('taskReduction');
const taskEmCatEl     = document.getElementById('taskEmCat');
const taskTargetPctEl = document.getElementById('taskTargetPct');
const createTaskBtn      = document.getElementById('createTaskBtn');
const tasksContainer     = document.getElementById('tasksContainer');
const taskCountEl        = document.getElementById('taskCountEl');
const noRecordsModal     = document.getElementById('noRecordsModal');
const noRecordsVazgecBtn = document.getElementById('noRecordsVazgecBtn');

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_LABELS  = { pending: 'Bekliyor', in_progress: 'Devam Ediyor', completed: 'Tamamlandı' };
const STATUS_CLASSES = { pending: 'pending',  in_progress: 'in-progress',  completed: 'completed' };
const STATUS_OPTIONS = Object.entries(STATUS_LABELS)
  .map(([v, l]) => `<option value="${v}">${l}</option>`)
  .join('');

// ── No-records modal ──────────────────────────────────────────────────────────
function showNoRecordsModal() {
  if (noRecordsModal) noRecordsModal.style.display = 'flex';
}
function hideNoRecordsModal() {
  if (noRecordsModal) noRecordsModal.style.display = 'none';
}
noRecordsVazgecBtn?.addEventListener('click', hideNoRecordsModal);
noRecordsModal?.addEventListener('click', e => { if (e.target === noRecordsModal) hideNoRecordsModal(); });

// ── Admin guard ───────────────────────────────────────────────────────────────
async function guardAdmin() {
  const res = await householdService.getMe();
  const h   = res.data?.household;
  if (!h || h.role !== 'admin') {
    window.location.href = 'household.html';
    throw new Error('not-admin');
  }
}

// ── Populate assignee dropdown ────────────────────────────────────────────────
async function loadMembers() {
  try {
    const res     = await householdService.getMembers();
    const members = res.data?.members ?? [];
    members.forEach(m => {
      const opt = document.createElement('option');
      opt.value       = m.user_id;
      opt.textContent = `👤 ${m.name || m.email}${m.role === 'admin' ? ' (Yönetici)' : ''}`;
      taskAssigneeEl.appendChild(opt);
    });
  } catch {
    // Members dropdown is optional — continue without it
  }
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
            <th>Atanan</th>
            <th style="text-align:right">Hedef Azaltım</th>
            <th>Son Tarih</th>
            <th style="min-width:160px;">İlerleme</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody id="tasksBody">
          ${tasks.map(t => taskRow(t)).join('')}
        </tbody>
      </table>
    </div>`;

  tasksContainer.querySelectorAll('.hh-status-select').forEach(sel => {
    sel.addEventListener('change', () => handleStatusChange(sel));
  });
}

const PROG_COLORS = {
  on_track:   'var(--color-primary)',
  at_risk:    '#f59e0b',
  off_track:  'var(--color-error)',
  successful: '#16a34a',
  failed:     'var(--color-error)',
  no_data:     'var(--color-text-muted)',
  no_baseline: '#9ca3af',
};
const PROG_LABELS = {
  on_track:    'Yolunda',
  at_risk:     'Risk Altında',
  off_track:   'Geride',
  successful:  'Başarılı',
  failed:      'Başarısız',
  no_data:     'Veri Bekleniyor',
  no_baseline: 'Başlangıç Verisi Bekleniyor',
};

function taskRow(t) {
  const desc = t.description
    ? `<div style="font-size:12px;color:var(--color-text-muted);margin-top:2px;">${t.description}</div>`
    : '';

  const assignee  = t.assigned_to_name ? `👤 ${t.assigned_to_name}` : '🏠 Tüm Hane';
  const dueDate   = t.due_date ? formatDate(t.due_date) : '—';
  const reduction = t.target_reduction ? `${parseFloat(t.target_reduction).toFixed(1)} kg` : '—';

  const options = Object.entries(STATUS_LABELS).map(([v, l]) =>
    `<option value="${v}"${t.status === v ? ' selected' : ''}>${l}</option>`
  ).join('');

  // Progress cell for emission-tracked tasks
  let progressCell = '<span style="color:var(--color-text-muted);font-size:12px;">—</span>';
  if (t.emission_category) {
    const catMeta = `<div style="font-size:11px;color:var(--color-text-muted);margin-top:3px;">${t.emission_category}${t.target_pct ? ' · %' + t.target_pct + ' hedef' : ''}</div>`;

    if (t.target_amount == null) {
      // Baseline not yet available (no previous month data when task was created)
      const color   = PROG_COLORS['no_baseline'];
      const current = t.current_amount != null ? parseFloat(t.current_amount) : null;
      const currentHtml = current != null
        ? `<div style="font-size:12px;margin-bottom:4px;">Güncel: <strong>${current.toFixed(1)} kg CO₂e</strong></div>`
        : '';
      progressCell = `
        <div style="min-width:190px;">
          ${currentHtml}
          <span style="font-size:11px;font-weight:700;color:${color};padding:2px 8px;border-radius:99px;background:${color}20;">Başlangıç Verisi Bekleniyor</span>
          ${catMeta}
        </div>`;
    } else {
      // Full tracking: baseline + target available
      const target   = parseFloat(t.target_amount);
      const baseline = t.baseline_amount != null ? parseFloat(t.baseline_amount) : null;
      const current  = t.current_amount  != null ? parseFloat(t.current_amount)  : null;
      const color    = PROG_COLORS[t.progress_status] || 'var(--color-text-muted)';
      const label    = PROG_LABELS[t.progress_status] || 'Bekliyor';

      // Progress bar: reduction progress from baseline toward target (higher = better)
      let barPct = 0;
      if (current != null && baseline != null && baseline > target) {
        barPct = Math.max(0, Math.min(100, Math.round((baseline - current) / (baseline - target) * 100)));
      } else if (current != null && target > 0) {
        barPct = current <= target ? 100 : Math.max(0, Math.round((1 - (current - target) / target) * 50));
      }

      let reductionPctHtml = '';
      if (current != null && baseline != null && baseline > 0) {
        const achieved = Math.round((baseline - current) / baseline * 100);
        reductionPctHtml = `<div style="font-size:11px;color:var(--color-text-muted);">İlerleme: <strong>${achieved}%</strong></div>`;
      }

      const baselineHtml = baseline != null
        ? `<div style="font-size:12px;">Başlangıç: <strong>${baseline.toFixed(1)} kg CO₂e</strong></div>`
        : '';
      const targetHtml  = `<div style="font-size:12px;">Hedef: <strong>${target.toFixed(1)} kg CO₂e</strong></div>`;
      const currentHtml = current != null
        ? `<div style="font-size:12px;">Güncel: <strong>${current.toFixed(1)} kg CO₂e</strong></div>`
        : `<div style="font-size:12px;color:var(--color-text-muted);">Güncel veri bekleniyor</div>`;

      progressCell = `
        <div style="min-width:190px;">
          ${baselineHtml}
          ${targetHtml}
          ${currentHtml}
          ${reductionPctHtml}
          <div style="margin:5px 0 4px;">
            <div style="background:var(--color-border);border-radius:99px;height:5px;">
              <div style="width:${barPct}%;background:${color};height:100%;border-radius:99px;transition:width 0.3s;"></div>
            </div>
          </div>
          <span style="font-size:11px;font-weight:700;color:${color};padding:2px 8px;border-radius:99px;background:${color}20;">${label}</span>
          ${catMeta}
        </div>`;
    }
  }

  return `
    <tr data-task-id="${t.id}">
      <td>
        <div style="font-weight:600;color:var(--color-text);">${t.title}</div>
        ${desc}
      </td>
      <td style="font-size:13px;">${assignee}</td>
      <td style="text-align:right;font-size:13px;">${reduction}</td>
      <td style="font-size:13px;">${dueDate}</td>
      <td>${progressCell}</td>
      <td>
        <select class="hh-status-select" data-task-id="${t.id}">
          ${options}
        </select>
      </td>
    </tr>`;
}

// ── Update task status ────────────────────────────────────────────────────────
async function handleStatusChange(selectEl) {
  const taskId = selectEl.dataset.taskId;
  const status = selectEl.value;
  selectEl.disabled = true;

  try {
    await householdService.updateTaskStatus(taskId, status);
    showToast('Güncellendi', `Görev durumu: ${STATUS_LABELS[status]}`, 'success');

    // Refresh badge next to select (no full reload needed)
    const row = selectEl.closest('tr');
    if (row) {
      const existingBadge = row.querySelector('.status-badge');
      if (existingBadge) {
        existingBadge.className    = `status-badge ${STATUS_CLASSES[status] || 'pending'}`;
        existingBadge.textContent  = STATUS_LABELS[status] || status;
      }
    }
  } catch (err) {
    showToast('Hata', err.message, 'error');
    // Revert to previous value by reloading
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
createTaskBtn?.addEventListener('click', async () => {
  const title = taskTitleEl?.value.trim();
  if (!title) {
    showToast('Hata', 'Görev başlığı gereklidir.', 'error');
    taskTitleEl?.focus();
    return;
  }

  const emCat    = taskEmCatEl?.value     || '';
  const targetPct = taskTargetPctEl?.value || '';

  // Emission tracking: both fields required together or both empty
  if ((emCat && !targetPct) || (!emCat && targetPct)) {
    showToast('Hata', 'Emisyon kategorisi ve azaltım hedefi birlikte girilmelidir.', 'error');
    (emCat ? taskTargetPctEl : taskEmCatEl)?.focus();
    return;
  }
  if (targetPct) {
    const pct = parseFloat(targetPct);
    if (isNaN(pct) || pct < 1 || pct > 99) {
      showToast('Hata', 'Azaltım hedefi 1 ile 99 arasında olmalıdır.', 'error');
      taskTargetPctEl?.focus();
      return;
    }
  }

  const payload = {
    title,
    description:       taskDescEl?.value.trim()  || undefined,
    assigned_to:       taskAssigneeEl?.value      || undefined,
    due_date:          taskDueDateEl?.value       || undefined,
    target_reduction:  taskReductEl?.value        || undefined,
    emission_category: emCat                      || undefined,
    target_pct:        targetPct                  || undefined,
  };

  createTaskBtn.disabled    = true;
  createTaskBtn.textContent = 'Oluşturuluyor…';
  try {
    await householdService.createTask(payload);
    showToast('Başarılı', 'Görev oluşturuldu.', 'success');

    // Reset form
    taskTitleEl.value      = '';
    taskDescEl.value       = '';
    taskDueDateEl.value    = '';
    taskReductEl.value     = '';
    taskAssigneeEl.value   = '';
    taskEmCatEl.value      = '';
    taskTargetPctEl.value  = '';

    await loadTasks();
  } catch (err) {
    if (err.message?.includes('en az bir emisyon kaydı')) {
      showNoRecordsModal();
    } else {
      showToast('Hata', err.message, 'error');
    }
  } finally {
    createTaskBtn.disabled    = false;
    createTaskBtn.textContent = 'Görev Oluştur';
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  // Prevent selecting past dates in the due-date picker
  if (taskDueDateEl) taskDueDateEl.min = new Date().toISOString().split('T')[0];

  try {
    await guardAdmin();
    await Promise.all([loadMembers(), loadTasks()]);
  } catch (err) {
    if (err.message !== 'not-admin') {
      showToast('Hata', err.message, 'error');
    }
  }
})();
