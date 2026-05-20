import { companyService } from './api/companyService.js';
import { renderLayout }   from './layout.js';
import { showToast, formatDate } from './utils/uiUtils.js';
import { getCategoryLabel } from './utils/labelUtils.js';

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
const ctTasksContainer = document.getElementById('ctTasksContainer');
const filterBar        = document.getElementById('filterBar');

// ── State ─────────────────────────────────────────────────────────────────────
let _allTasks = [];
let _filter   = 'all';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_LABELS = {
    pending:     'Bekliyor',
    in_progress: 'Devam Ediyor',
    completed:   'Tamamlandı',
    cancelled:   'İptal Edildi',
};

const STATUS_CLASSES = {
    pending:     'pending',
    in_progress: 'in-progress',
    completed:   'completed',
    cancelled:   'cancelled',
};

const PROG_COLORS = {
    not_started: { color: 'var(--color-text-muted)', bg: 'var(--color-surface-muted)' },
    on_track:    { color: '#16a34a', bg: 'rgba(22,163,74,0.12)'  },
    at_risk:     { color: '#d97706', bg: 'rgba(217,119,6,0.10)'  },
    off_track:   { color: '#ef4444', bg: 'rgba(239,68,68,0.10)'  },
    failed:      { color: '#ef4444', bg: 'rgba(239,68,68,0.10)'  },
    successful:  { color: '#16a34a', bg: 'rgba(22,163,74,0.12)'  },
};

const PROG_LABELS = {
    not_started: 'Henüz Başlamadı',
    on_track:    'Hedefe Uygun İlerliyor',
    at_risk:     'Dikkat: Hedef Aşılabilir',
    off_track:   'Limit Aşıldı',
    failed:      'Hedef Tutmadı',
    successful:  'Hedefe Ulaşıldı',
};

function progEmoji(status) {
    return { not_started: '⏸️', on_track: '🟢', at_risk: '🟡', off_track: '🔴', failed: '🔴', successful: '🏆' }[status] || '🟡';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTco2(val) {
    return parseFloat(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' tCO₂';
}

function dueDateHtml(dateStr) {
    if (!dateStr) return `<span style="color:var(--color-text-muted);font-size:12px;">Son tarih yok</span>`;
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const due      = new Date(dateStr);
    const diffDays = Math.round((due - today) / 86400000);
    let color  = 'var(--color-text-muted)';
    let suffix = '';
    if      (diffDays < 0)   { color = 'var(--color-error)'; suffix = ' (Geçti)'; }
    else if (diffDays === 0) { color = 'var(--color-error)'; suffix = ' (Bugün!)'; }
    else if (diffDays <= 7)  { color = '#f59e0b'; suffix = ` (${diffDays} gün)`; }
    return `<span style="color:${color};font-size:12px;font-weight:${diffDays <= 3 ? 700 : 400};">
        ${formatDate(dateStr)}${suffix}
    </span>`;
}

// ── Progress section ──────────────────────────────────────────────────────────
function buildProgressSection(t) {
    if (!t.emission_category) return '';

    const pctHint = t.target_reduction_pct
        ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">${getCategoryLabel(t.emission_category)} · %${parseFloat(t.target_reduction_pct)} hedef</div>`
        : '';

    if (t.target_emission == null) {
        return `
          <div class="hh-task-progress">
            <div class="hh-prog-badge" style="background:#f3f4f6;color:#9ca3af;">
              Başlangıç Verisi Bekleniyor
            </div>
            ${pctHint}
          </div>`;
    }

    const baseline     = parseFloat(t.baseline_emission);
    const periodTarget = t.period_target_emission != null ? parseFloat(t.period_target_emission) : null;
    const current      = t.current_emission != null ? parseFloat(t.current_emission) : null;
    const hasRecords   = current !== null && current > 0;
    const isNotStarted = t.progress_status === 'not_started';

    const hasStatus = hasRecords && t.progress_status && t.progress_status !== 'no_data';
    const progCol   = hasStatus
        ? (PROG_COLORS[t.progress_status] || { color: 'var(--color-text-muted)', bg: 'var(--color-surface-muted)' })
        : { color: '#d97706', bg: 'rgba(217,119,6,0.10)' };

    // Bar: 0 for not_started; otherwise current / period_target
    let barPct = 0;
    if (!isNotStarted && hasRecords && periodTarget !== null && periodTarget > 0) {
        barPct = Math.max(0, Math.min(100, Math.round(current / periodTarget * 100)));
    }

    const displayCurrent = current !== null ? current : 0;
    const currentStr = periodTarget !== null
        ? `${fmtTco2(displayCurrent)} / ${fmtTco2(periodTarget)}`
        : fmtTco2(displayCurrent);

    const remainingHtml = periodTarget !== null
        ? `<div>Kalan: <strong>${fmtTco2(Math.max(0, periodTarget - displayCurrent))}</strong></div>`
        : '';

    const offTrackAlert = (t.progress_status === 'off_track' || t.progress_status === 'failed')
        ? `<div class="hh-task-alert">⚠️ Bu görev hedeften uzaklaşıyor!</div>`
        : '';

    const knownStatus = t.progress_status && PROG_LABELS[t.progress_status];
    const statusBadge = knownStatus
        ? `<span class="hh-prog-badge" style="background:${progCol.bg};color:${progCol.color};">
             ${progEmoji(t.progress_status)} ${PROG_LABELS[t.progress_status]}
           </span>`
        : `<span class="hh-prog-badge" style="background:rgba(217,119,6,0.10);color:#d97706;">🟡 Takip Ediliyor</span>`;

    return `
      <div class="hh-task-progress">
        ${offTrackAlert}
        <div style="font-size:11px;color:var(--color-text-muted);display:flex;flex-direction:column;gap:3px;margin-bottom:6px;">
          <div>Aylık Baz: <strong>${fmtTco2(baseline)}</strong></div>
          ${periodTarget !== null ? `<div>Dönem Hedefi: <strong>${fmtTco2(periodTarget)}</strong></div>` : ''}
          <div>Güncel: <strong style="color:${hasRecords ? 'var(--color-text)' : 'var(--color-text-muted)'};">${currentStr}</strong></div>
          ${remainingHtml}
        </div>
        <div class="hh-prog-bar-track">
          <div class="hh-prog-bar-fill" style="width:${barPct}%;background:${progCol.color};"></div>
        </div>
        <div style="display:flex;align-items:center;margin-top:4px;">
          ${statusBadge}
        </div>
        ${pctHint}
      </div>`;
}

// ── Task card ─────────────────────────────────────────────────────────────────
function taskCard(t) {
    const isCancelled = t.status === 'cancelled';
    const isCompleted = t.status === 'completed';
    const isDimmed    = isCancelled || isCompleted;

    const desc = t.description
        ? `<p class="hh-task-card-desc">${t.description}</p>`
        : '';

    const catChip = t.emission_category
        ? `<span class="hh-task-assignee-chip">${getCategoryLabel(t.emission_category)}</span>`
        : '';

    const options = Object.entries(STATUS_LABELS).map(([v, l]) =>
        `<option value="${v}"${t.status === v ? ' selected' : ''}>${l}</option>`
    ).join('');

    const progressSection = isCancelled ? '' : buildProgressSection(t);

    return `
      <div class="hh-task-card${isDimmed ? ' hh-task-card--dim' : ''}" data-task-id="${t.id}">
        <div class="hh-task-card-top">
          <span class="status-badge ${STATUS_CLASSES[t.status] || ''}">${STATUS_LABELS[t.status] || t.status}</span>
          ${catChip}
        </div>

        <h3 class="hh-task-card-title">${t.title}</h3>
        ${desc}

        ${progressSection}

        <div class="hh-task-card-footer">
          <div style="display:flex;align-items:center;gap:6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 style="flex-shrink:0;color:var(--color-text-muted);">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            ${dueDateHtml(t.due_date)}
          </div>
          <div class="hh-task-card-action">
            <select class="hh-status-select" data-task-id="${t.id}" data-status="${t.status}">
              ${options}
            </select>
          </div>
        </div>
      </div>`;
}

// ── Filter logic ──────────────────────────────────────────────────────────────
function filteredTasks() {
    if (_filter === 'all') return _allTasks;
    return _allTasks.filter(t => t.status === _filter);
}

function updateFilterCounts() {
    const counts = { all: _allTasks.length, pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    _allTasks.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
    document.getElementById('fcAll').textContent       = counts.all         || '';
    document.getElementById('fcPending').textContent   = counts.pending     || '';
    document.getElementById('fcInProgress').textContent = counts.in_progress || '';
    document.getElementById('fcCompleted').textContent = counts.completed   || '';
    document.getElementById('fcCancelled').textContent = counts.cancelled   || '';
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTasks() {
    const tasks = filteredTasks();

    if (!tasks.length) {
        const emptyMsg = _filter === 'all'
            ? 'Henüz görev oluşturulmadı. <a href="create-company-task.html" style="color:var(--color-primary);text-decoration:underline;">İlk görevi oluşturun.</a>'
            : 'Bu filtreye uygun görev yok.';
        ctTasksContainer.innerHTML = `
          <div class="hh-empty">
            <div class="hh-empty-icon">✅</div>
            <p>${emptyMsg}</p>
          </div>`;
        return;
    }

    ctTasksContainer.innerHTML = `<div class="hh-task-cards-grid">${tasks.map(taskCard).join('')}</div>`;

    ctTasksContainer.querySelectorAll('.hh-status-select').forEach(sel => {
        sel.addEventListener('change', () => handleStatusChange(sel));
    });
}

// ── Status change ─────────────────────────────────────────────────────────────
async function handleStatusChange(selectEl) {
    const taskId     = selectEl.dataset.taskId;
    const status     = selectEl.value;
    const prevStatus = selectEl.dataset.status;
    selectEl.disabled = true;

    try {
        await companyService.updateTaskStatus(taskId, status);
        showToast('Güncellendi', `Görev durumu: ${STATUS_LABELS[status]}`, 'success');
        await loadTasks();
    } catch (err) {
        showToast('Hata', err.message, 'error');
        selectEl.value    = prevStatus;
        selectEl.disabled = false;
    }
}

// ── Load tasks ────────────────────────────────────────────────────────────────
async function loadTasks() {
    ctTasksContainer.innerHTML = '<div class="hh-loading">Yükleniyor…</div>';
    try {
        const res = await companyService.getTasks();
        _allTasks = res.data?.tasks ?? [];
        updateFilterCounts();
        renderTasks();
    } catch (err) {
        ctTasksContainer.innerHTML = `<div class="hh-empty"><p>Görevler yüklenemedi: ${err.message}</p></div>`;
    }
}

// ── Filter bar wiring ─────────────────────────────────────────────────────────
filterBar?.querySelectorAll('.hh-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        filterBar.querySelectorAll('.hh-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _filter = btn.dataset.filter;
        renderTasks();
    });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadTasks();
