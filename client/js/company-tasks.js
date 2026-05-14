import { companyService } from './api/companyService.js';
import { renderLayout }   from './layout.js';
import { showToast, formatDate } from './utils/uiUtils.js';
import { getCategoryLabelWithEmoji } from './utils/labelUtils.js';

const user = renderLayout({ activeNav: 'nav-company', title: 'Şirket Görevleri' });
if (!user) throw new Error('redirect');

if (user.role !== 'company') {
    const pb = document.querySelector('.page-body');
    if (pb) pb.innerHTML = `
        <div class="content-card glass-card" style="text-align:center;padding:48px 24px;max-width:480px;margin:48px auto;">
            <div style="font-size:48px;margin-bottom:16px;">🔒</div>
            <h2 style="font-size:20px;font-weight:700;margin-bottom:10px;">Erişim Kısıtlı</h2>
            <p style="color:var(--color-text-muted);font-size:14px;margin:0 0 24px;">
                Bu özellik yalnızca şirket hesapları için kullanılabilir.
            </p>
            <a href="dashboard.html" class="btn-primary">Özet Panele Dön</a>
        </div>`;
    throw new Error('non-company-role');
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const ctTitleEl      = document.getElementById('ctTitle');
const ctDescEl       = document.getElementById('ctDesc');
const ctDueDateEl    = document.getElementById('ctDueDate');
const ctEmCatEl      = document.getElementById('ctEmCat');
const ctTargetPctEl  = document.getElementById('ctTargetPct');
const ctCreateBtn    = document.getElementById('ctCreateBtn');
const ctTasksContainer = document.getElementById('ctTasksContainer');
const ctTaskCountEl  = document.getElementById('ctTaskCountEl');

// ── Display constants ─────────────────────────────────────────────────────────
const STATUS_LABELS  = { pending: 'Bekliyor', in_progress: 'Devam Ediyor', completed: 'Tamamlandı' };

const PROG_COLORS = {
    on_track:    'var(--color-primary)',
    at_risk:     '#f59e0b',
    off_track:   'var(--color-error)',
    successful:  '#16a34a',
    no_data:     'var(--color-text-muted)',
    no_baseline: '#9ca3af',
};
const PROG_LABELS = {
    on_track:    'Yolunda',
    at_risk:     'Risk Altında',
    off_track:   'Geride',
    successful:  'Başarılı',
    no_data:     'Veri Bekleniyor',
    no_baseline: 'Başlangıç Verisi Bekleniyor',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTco2(val) {
    return parseFloat(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' tCO₂';
}

// ── Render tasks table ────────────────────────────────────────────────────────
function renderTasks(tasks) {
    if (ctTaskCountEl) ctTaskCountEl.textContent = `${tasks.length} görev`;

    if (!tasks.length) {
        ctTasksContainer.innerHTML = `
          <div class="hh-empty">
            <div class="hh-empty-icon">✅</div>
            <p>Henüz görev oluşturulmadı. Yukarıdaki formu kullanın.</p>
          </div>`;
        return;
    }

    ctTasksContainer.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="hh-tasks-table">
          <thead>
            <tr>
              <th style="min-width:200px;">Görev</th>
              <th>Kategori</th>
              <th>Son Tarih</th>
              <th style="min-width:200px;">İlerleme</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map(taskRow).join('')}
          </tbody>
        </table>
      </div>`;

    ctTasksContainer.querySelectorAll('.ct-status-select').forEach(sel => {
        sel.addEventListener('change', () => handleStatusChange(sel));
    });
}

function taskRow(t) {
    const desc = t.description
        ? `<div style="font-size:12px;color:var(--color-text-muted);margin-top:2px;">${t.description}</div>`
        : '';

    const dueDate = t.due_date ? formatDate(t.due_date) : '—';
    const category = t.emission_category
        ? getCategoryLabelWithEmoji(t.emission_category)
        : '—';

    const options = Object.entries(STATUS_LABELS).map(([v, l]) =>
        `<option value="${v}"${t.status === v ? ' selected' : ''}>${l}</option>`
    ).join('');

    const progressCell = buildProgressCell(t);

    return `
      <tr data-task-id="${t.id}">
        <td>
          <div style="font-weight:600;color:var(--color-text);">${t.title}</div>
          ${desc}
        </td>
        <td style="font-size:13px;">${category}</td>
        <td style="font-size:13px;">${dueDate}</td>
        <td>${progressCell}</td>
        <td>
          <select class="ct-status-select" data-task-id="${t.id}">${options}</select>
        </td>
      </tr>`;
}

function buildProgressCell(t) {
    if (!t.emission_category) {
        return '<span style="color:var(--color-text-muted);font-size:12px;">—</span>';
    }

    const pctHint = t.target_reduction_pct
        ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:3px;">${getCategoryLabelWithEmoji(t.emission_category)} · %${parseFloat(t.target_reduction_pct)} hedef</div>`
        : '';

    // No baseline stored yet
    if (t.target_emission == null) {
        const color   = PROG_COLORS['no_baseline'];
        const current = t.current_emission != null ? t.current_emission : null;
        const currHtml = current !== null
            ? `<div style="font-size:12px;margin-bottom:4px;">Güncel: <strong>${fmtTco2(current)}</strong></div>`
            : '';
        return `
          <div style="min-width:190px;">
            ${currHtml}
            <span style="font-size:11px;font-weight:700;color:${color};padding:2px 8px;
                  border-radius:99px;background:${color}20;">Başlangıç Verisi Bekleniyor</span>
            ${pctHint}
          </div>`;
    }

    const target   = parseFloat(t.target_emission);
    const baseline = parseFloat(t.baseline_emission);
    const current  = t.current_emission != null ? parseFloat(t.current_emission) : null;
    const color    = PROG_COLORS[t.progress_status] || 'var(--color-text-muted)';
    const label    = PROG_LABELS[t.progress_status] || 'Bekliyor';

    // Progress bar: reduction progress from baseline toward target
    let barPct = 0;
    if (current !== null && baseline > target) {
        barPct = Math.max(0, Math.min(100,
            Math.round((baseline - current) / (baseline - target) * 100)
        ));
    }

    let achievedHtml = '';
    if (current !== null && baseline > 0) {
        const achieved = Math.round((baseline - current) / baseline * 100);
        achievedHtml = `<div style="font-size:11px;color:var(--color-text-muted);">İlerleme: <strong>${achieved}%</strong></div>`;
    }

    const baselineHtml = `<div style="font-size:12px;">Başlangıç: <strong>${fmtTco2(baseline)}</strong></div>`;
    const targetHtml   = `<div style="font-size:12px;">Hedef: <strong>${fmtTco2(target)}</strong></div>`;
    const currentHtml  = current !== null
        ? `<div style="font-size:12px;">Güncel: <strong>${fmtTco2(current)}</strong></div>`
        : `<div style="font-size:12px;color:var(--color-text-muted);">Güncel veri bekleniyor</div>`;

    return `
      <div style="min-width:190px;">
        ${baselineHtml}
        ${targetHtml}
        ${currentHtml}
        ${achievedHtml}
        <div style="margin:5px 0 4px;">
          <div style="background:var(--color-border);border-radius:99px;height:5px;">
            <div style="width:${barPct}%;background:${color};height:100%;border-radius:99px;transition:width 0.3s;"></div>
          </div>
        </div>
        <span style="font-size:11px;font-weight:700;color:${color};padding:2px 8px;
              border-radius:99px;background:${color}20;">${label}</span>
        ${pctHint}
      </div>`;
}

// ── Status change ─────────────────────────────────────────────────────────────
async function handleStatusChange(selectEl) {
    const taskId = selectEl.dataset.taskId;
    const status = selectEl.value;
    selectEl.disabled = true;

    try {
        await companyService.updateTaskStatus(taskId, status);
        showToast('Güncellendi', `Görev durumu: ${STATUS_LABELS[status]}`, 'success');
    } catch (err) {
        showToast('Hata', err.message, 'error');
        await loadTasks();
    } finally {
        selectEl.disabled = false;
    }
}

// ── Load tasks ────────────────────────────────────────────────────────────────
async function loadTasks() {
    ctTasksContainer.innerHTML = '<div class="hh-loading">Yükleniyor…</div>';
    try {
        const res = await companyService.getTasks();
        renderTasks(res.data?.tasks ?? []);
    } catch (err) {
        ctTasksContainer.innerHTML = `<div class="hh-empty"><p>Görevler yüklenemedi: ${err.message}</p></div>`;
    }
}

// ── Create task ───────────────────────────────────────────────────────────────
ctCreateBtn?.addEventListener('click', async () => {
    const title = ctTitleEl?.value.trim();
    if (!title) {
        showToast('Hata', 'Görev başlığı gereklidir.', 'error');
        ctTitleEl?.focus();
        return;
    }

    const emCat    = ctEmCatEl?.value    || '';
    const targetPct = ctTargetPctEl?.value || '';

    if ((emCat && !targetPct) || (!emCat && targetPct)) {
        showToast('Hata', 'Emisyon kategorisi ve azaltım hedefi birlikte girilmelidir.', 'error');
        (emCat ? ctTargetPctEl : ctEmCatEl)?.focus();
        return;
    }
    if (targetPct) {
        const pct = parseFloat(targetPct);
        if (isNaN(pct) || pct < 1 || pct > 99) {
            showToast('Hata', 'Azaltım hedefi 1 ile 99 arasında olmalıdır.', 'error');
            ctTargetPctEl?.focus();
            return;
        }
    }

    ctCreateBtn.disabled    = true;
    ctCreateBtn.textContent = 'Oluşturuluyor…';

    try {
        await companyService.createTask({
            title,
            description:         ctDescEl?.value.trim()  || undefined,
            due_date:            ctDueDateEl?.value       || undefined,
            emission_category:   emCat                   || undefined,
            target_reduction_pct: targetPct              || undefined,
        });
        showToast('Başarılı', 'Görev oluşturuldu.', 'success');

        ctTitleEl.value     = '';
        ctDescEl.value      = '';
        ctDueDateEl.value   = '';
        ctEmCatEl.value     = '';
        ctTargetPctEl.value = '';

        await loadTasks();
    } catch (err) {
        showToast('Hata', err.message, 'error');
    } finally {
        ctCreateBtn.disabled    = false;
        ctCreateBtn.textContent = 'Görev Oluştur';
    }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
    if (ctDueDateEl) ctDueDateEl.min = new Date().toISOString().split('T')[0];
    await loadTasks();
})();
