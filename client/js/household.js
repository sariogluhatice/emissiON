import { householdService } from './api/householdService.js';
import { renderLayout }     from './layout.js';
import { showToast, formatDate } from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-household', title: 'Hanem' });
if (!user) throw new Error('redirect');

// Block non-household account types immediately — no API call needed.
if (user.role !== 'household') {
    document.addEventListener('DOMContentLoaded', () => {}, { once: true });
    const pb = document.querySelector('.page-body');
    if (pb) {
        pb.innerHTML = `
            <div class="content-card glass-card" style="text-align:center;padding:48px 24px;max-width:480px;margin:48px auto;">
                <div style="font-size:48px;margin-bottom:16px;">🔒</div>
                <h2 style="font-size:20px;font-weight:700;color:var(--color-text);margin-bottom:10px;">
                    Erişim Kısıtlı
                </h2>
                <p style="color:var(--color-text-muted);font-size:14px;margin:0 0 24px;">
                    Bu özellik yalnızca hane hesapları için kullanılabilir.
                    Hane hesabı oluşturmak için yeni bir kayıt açmanız gerekmektedir.
                </p>
                <a href="dashboard.html" class="btn-primary">Özet Panele Dön</a>
            </div>`;
    }
    throw new Error('non-household-role');
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl       = document.getElementById('loadingState');
const noHouseholdEl   = document.getElementById('noHouseholdState');
const householdEl     = document.getElementById('householdState');

const createNameEl    = document.getElementById('createName');
const createTargetEl  = document.getElementById('createTarget');
const createBtn       = document.getElementById('createHouseholdBtn');
const joinCodeEl      = document.getElementById('joinCode');
const joinBtn         = document.getElementById('joinHouseholdBtn');

const hhNameEl        = document.getElementById('hhName');
const hhRoleBadgeEl   = document.getElementById('hhRoleBadge');
const hhInviteBox     = document.getElementById('hhInviteBox');
const hhInviteCodeEl  = document.getElementById('hhInviteCode');
const hhCopyBtn       = document.getElementById('hhCopyBtn');
const hhAdminLinks    = document.getElementById('hhAdminLinks');
const allTasksLink    = document.getElementById('allTasksLink');

const statTotal       = document.getElementById('statTotal');
const statMembers     = document.getElementById('statMembers');
const statPerMember   = document.getElementById('statPerMember');
const statTarget      = document.getElementById('statTarget');
const statTargetCard  = document.getElementById('statTargetCard');

const categoryList    = document.getElementById('categoryList');
const recentTasksList = document.getElementById('recentTasksList');
const comparisonEl    = document.getElementById('comparisonSection');

let monthlyChartInstance = null;

// ── Status label helpers ──────────────────────────────────────────────────────
const STATUS_LABELS  = { pending: 'Bekliyor', in_progress: 'Devam Ediyor', completed: 'Tamamlandı' };
const STATUS_CLASSES = { pending: 'pending',  in_progress: 'in-progress',  completed: 'completed' };

const CAT_EMOJI = {
  energy: '⚡', electricity: '⚡', water: '💧', gas: '🔥', transport: '🚗',
  food: '🍽️', shopping: '🛍️', waste: '🗑️', materials: '📦',
};
const catEmoji = (c) => CAT_EMOJI[String(c).toLowerCase()] ?? '📌';

// ── Show / hide state panels ──────────────────────────────────────────────────
const show = (el) => { el.style.display = 'block'; };
const hide = (el) => { el.style.display = 'none'; };

// ── Render household header ───────────────────────────────────────────────────
function renderHeader(household) {
  hhNameEl.textContent = household.name;

  const isAdmin = household.role === 'admin';
  hhRoleBadgeEl.textContent  = isAdmin ? 'Hane Yöneticisi' : 'Hane Üyesi';
  hhRoleBadgeEl.className    = `hh-role-badge ${household.role}`;

  if (isAdmin && household.invite_code) {
    hhInviteCodeEl.textContent = household.invite_code;
    show(hhInviteBox);
    show(hhAdminLinks);
    if (allTasksLink) show(allTasksLink);
  }

  statMembers.textContent     = household.member_count ?? '—';
  statTotal.textContent       = household.total_emissions != null
    ? parseFloat(household.total_emissions).toFixed(1) : '—';
  statPerMember.textContent   = household.member_count > 0 && household.total_emissions != null
    ? (household.total_emissions / household.member_count).toFixed(1) : '—';

  if (household.monthly_target) {
    statTarget.textContent = parseFloat(household.monthly_target).toFixed(0);
  } else {
    if (statTargetCard) statTargetCard.style.opacity = '0.45';
    statTarget.textContent = 'Belirlenmedi';
  }
}

// ── Monthly bar chart ─────────────────────────────────────────────────────────
function renderChart(monthlyData) {
  const canvas = document.getElementById('monthlyChart');
  if (!canvas || !monthlyData?.length) return;

  const sorted   = [...monthlyData].reverse();
  const labels   = sorted.map(d => d.month);
  const values   = sorted.map(d => parseFloat(d.total_amount));

  if (monthlyChartInstance) monthlyChartInstance.destroy();

  monthlyChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'kg CO₂e',
        data: values,
        backgroundColor: 'rgba(91, 173, 142, 0.55)',
        borderColor:     '#5BAD8E',
        borderWidth: 2,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => v + ' kg' },
        },
      },
    },
  });
}

// ── Category breakdown ────────────────────────────────────────────────────────
function renderCategories(breakdown) {
  if (!categoryList) return;

  if (!breakdown?.length) {
    categoryList.innerHTML = `<div class="hh-empty"><div class="hh-empty-icon">📊</div><p>Henüz emisyon kaydı yok.</p></div>`;
    return;
  }

  const total = breakdown.reduce((s, c) => s + parseFloat(c.total_amount), 0);

  categoryList.innerHTML = breakdown.map(cat => {
    const pct = total > 0 ? (parseFloat(cat.total_amount) / total * 100).toFixed(1) : 0;
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);">
        <span style="font-size:18px;flex-shrink:0;">${catEmoji(cat.category)}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:4px;">
            <span>${cat.category ?? 'Diğer'}</span>
            <span>${parseFloat(cat.total_amount).toFixed(1)} kg</span>
          </div>
          <div style="background:var(--color-border);border-radius:99px;height:5px;">
            <div style="width:${pct}%;background:var(--color-primary);height:100%;border-radius:99px;"></div>
          </div>
        </div>
        <span style="font-size:12px;color:var(--color-text-muted);width:36px;text-align:right;">${pct}%</span>
      </div>`;
  }).join('');
}

// ── Recent tasks ──────────────────────────────────────────────────────────────
function renderRecentTasks(tasks, isAdmin) {
  if (!recentTasksList) return;

  const visible = isAdmin
    ? tasks
    : tasks.filter(t => t.assigned_to == null || String(t.assigned_to) === String(user.id));

  if (!visible.length) {
    recentTasksList.innerHTML = `<div class="hh-empty"><div class="hh-empty-icon">✅</div><p>Henüz görev yok.</p></div>`;
    return;
  }

  const NEXT_STATUS = { pending: 'in_progress', in_progress: 'completed' };

  recentTasksList.innerHTML = visible.map(t => {
    const isMemberOwnTask = !isAdmin
      && t.assigned_to != null
      && String(t.assigned_to) === String(user.id);
    const nextStatus = NEXT_STATUS[t.status];
    const canAdvance = isMemberOwnTask && !!nextStatus;

    const statusEl = canAdvance
      ? `<select class="hh-task-status-select" data-task-id="${t.id}" data-current="${t.status}" style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);cursor:pointer;">
           <option value="${t.status}" selected>${STATUS_LABELS[t.status]}</option>
           <option value="${nextStatus}">${STATUS_LABELS[nextStatus]}</option>
         </select>`
      : `<span class="status-badge ${STATUS_CLASSES[t.status] || 'pending'}">${STATUS_LABELS[t.status] || t.status}</span>`;

    // Progress bar for emission-tracked tasks
    let progressHtml = '';
    if (t.emission_category && t.target_amount != null && t.current_amount != null) {
      const current  = parseFloat(t.current_amount);
      const target   = parseFloat(t.target_amount);
      const barPct   = target > 0 ? Math.min(100, Math.round(current / target * 100)) : 100;
      const PROG_COLORS  = { on_track: 'var(--color-primary)', at_risk: '#f59e0b', off_track: 'var(--color-error)' };
      const PROG_LABELS  = { on_track: 'Yolunda', at_risk: 'Risk Altında', off_track: 'Geride' };
      const color = PROG_COLORS[t.progress_status] || 'var(--color-border)';
      const badge = PROG_LABELS[t.progress_status] || '';
      progressHtml = `
        <div style="margin-top:6px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-text-muted);margin-bottom:3px;">
            <span>${current.toFixed(1)} / ${target.toFixed(1)} kg CO₂e</span>
            <span style="font-weight:700;color:${color};">${badge}</span>
          </div>
          <div style="background:var(--color-border);border-radius:99px;height:4px;">
            <div style="width:${barPct}%;background:${color};height:100%;border-radius:99px;"></div>
          </div>
        </div>`;
    }

    return `
    <div class="hh-task-item" data-task-id="${t.id}">
      <div style="flex:1;min-width:0;">
        <div class="hh-task-title">${t.title}</div>
        <div class="hh-task-meta">
          ${t.assigned_to_name ? `👤 ${t.assigned_to_name}` : '🏠 Tüm Hane'}
          ${t.due_date ? ` · 📅 ${formatDate(t.due_date)}` : ''}
        </div>
        ${progressHtml}
      </div>
      ${statusEl}
    </div>`;
  }).join('');

  recentTasksList.querySelectorAll('.hh-task-status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const taskId    = sel.dataset.taskId;
      const newStatus = sel.value;
      sel.disabled    = true;
      try {
        await householdService.updateTaskStatus(taskId, newStatus);
        showToast('Başarılı', `Görev durumu: ${STATUS_LABELS[newStatus]}`, 'success');
        const badge = `<span class="status-badge ${STATUS_CLASSES[newStatus] || 'pending'}">${STATUS_LABELS[newStatus]}</span>`;
        sel.outerHTML = badge;
      } catch (err) {
        showToast('Hata', err.message, 'error');
        sel.value    = sel.dataset.current;
        sel.disabled = false;
      }
    });
  });
}

// ── Comparison section ────────────────────────────────────────────────────────
function renderComparison(comp) {
  if (!comparisonEl) return;

  if (!comp.comparison_available) {
    comparisonEl.innerHTML = `<div class="hh-empty"><div class="hh-empty-icon">📈</div><p>${comp.message}</p></div>`;
    return;
  }

  const pct   = comp.percentile ?? 0;
  const badge = comp.badge ?? '';

  comparisonEl.innerHTML = `
    <p style="font-size:13px;color:var(--color-text-muted);margin:0 0 12px;">
      ${comp.message ?? ''}
    </p>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <span style="font-size:28px;font-weight:800;color:var(--color-text);">${pct}%</span>
      <span style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;
        background:var(--color-success-soft);color:var(--color-primary-dark);">${badge}</span>
    </div>
    <div class="hh-percentile-bar-track">
      <div class="hh-percentile-bar-fill" style="width:${pct}%"></div>
    </div>
    <div class="hh-compare-grid">
      <div class="hh-compare-cell">
        <div class="hh-compare-cell-label">Sizin Ortalamanız</div>
        <div class="hh-compare-cell-value">${comp.your_household.emissions_per_member.toFixed(1)}</div>
        <div class="hh-compare-cell-unit">kg CO₂e / kişi</div>
      </div>
      <div class="hh-compare-cell">
        <div class="hh-compare-cell-label">Benzer Haneler Ort.</div>
        <div class="hh-compare-cell-value">${comp.similar_households.avg_per_member?.toFixed(1) ?? '—'}</div>
        <div class="hh-compare-cell-unit">kg CO₂e / kişi · ${comp.similar_households.count} hane</div>
      </div>
    </div>`;
}

// ── Create household ──────────────────────────────────────────────────────────
createBtn?.addEventListener('click', async () => {
  const name   = createNameEl?.value.trim();
  const target = createTargetEl?.value.trim() || null;

  if (!name || name.length < 2) {
    showToast('Hata', 'Hane adı en az 2 karakter olmalıdır.', 'error');
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = 'Oluşturuluyor…';
  try {
    await householdService.create({ name, monthly_target: target || undefined });
    showToast('Başarılı', 'Hane oluşturuldu! Sayfa yenileniyor…', 'success');
    setTimeout(() => window.location.reload(), 1200);
  } catch (err) {
    showToast('Hata', err.message, 'error');
    createBtn.disabled = false;
    createBtn.textContent = 'Hane Oluştur';
  }
});

// ── Join household ────────────────────────────────────────────────────────────
joinBtn?.addEventListener('click', async () => {
  const invite_code = joinCodeEl?.value.trim().toUpperCase();
  if (!invite_code) {
    showToast('Hata', 'Lütfen davet kodunu girin.', 'error');
    return;
  }

  joinBtn.disabled = true;
  joinBtn.textContent = 'Katılınıyor…';
  try {
    await householdService.join({ invite_code });
    showToast('Başarılı', 'Haneye katıldınız! Sayfa yenileniyor…', 'success');
    setTimeout(() => window.location.reload(), 1200);
  } catch (err) {
    showToast('Hata', err.message, 'error');
    joinBtn.disabled = false;
    joinBtn.textContent = 'Haneye Katıl';
  }
});

// ── Invite code copy ──────────────────────────────────────────────────────────
hhCopyBtn?.addEventListener('click', () => {
  const code = hhInviteCodeEl?.textContent;
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    hhCopyBtn.textContent = 'Kopyalandı!';
    setTimeout(() => { hhCopyBtn.textContent = 'Kopyala'; }, 2000);
  });
});

// ── Main init ─────────────────────────────────────────────────────────────────
async function init() {
  try {
    const meRes     = await householdService.getMe();
    const household = meRes.data?.household;

    hide(loadingEl);

    if (!household) {
      show(noHouseholdEl);

      const intent     = localStorage.getItem('household_intent');
      const storedCode = localStorage.getItem('household_invite_code');
      // Consume immediately — on failure the user retries manually, no auto-loop on refresh
      localStorage.removeItem('household_intent');
      localStorage.removeItem('household_invite_code');

      if (intent === 'join' && storedCode) {
        // Auto-fill and auto-attempt the join so the user never has to retype the code
        if (joinCodeEl) joinCodeEl.value = storedCode;
        joinBtn.disabled    = true;
        joinBtn.textContent = 'Katılınıyor…';

        try {
          await householdService.join({ invite_code: storedCode });
          showToast('Başarılı', 'Haneye katıldınız! Sayfa yenileniyor…', 'success');
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          // Auto-join failed — code is pre-filled, user can correct and retry
          joinBtn.disabled    = false;
          joinBtn.textContent = 'Haneye Katıl';
          showToast('Hata', err.message, 'error');
          joinBtn?.focus();
        }
      } else if (intent === 'create') {
        createNameEl?.focus();
      } else if (intent === 'join') {
        // intent was join but no code stored (edge case) — focus the code field
        joinCodeEl?.focus();
      }

      return;
    }

    show(householdEl);
    renderHeader(household);

    const isAdmin = household.role === 'admin';

    // Load dashboard and comparison in parallel; use allSettled so one
    // failure doesn't block the other section from rendering.
    const [dashResult, compResult] = await Promise.allSettled([
      householdService.getDashboard(),
      householdService.getComparison(),
    ]);

    if (dashResult.status === 'fulfilled') {
      const dash = dashResult.value.data?.dashboard;
      if (dash) {
        renderChart(dash.monthly_emissions);
        renderCategories(dash.category_breakdown);
        renderRecentTasks(dash.recent_tasks ?? [], isAdmin);
      }
    } else {
      showToast('Uyarı', 'Pano verileri yüklenemedi.', 'error');
      categoryList.innerHTML    = `<div class="hh-empty"><p>Yüklenemedi.</p></div>`;
      recentTasksList.innerHTML = `<div class="hh-empty"><p>Yüklenemedi.</p></div>`;
    }

    if (compResult.status === 'fulfilled') {
      renderComparison(compResult.value.data?.comparison);
    } else {
      comparisonEl.innerHTML = `<div class="hh-empty"><p>Karşılaştırma yüklenemedi.</p></div>`;
    }

  } catch (err) {
    hide(loadingEl);
    showToast('Hata', err.message, 'error');
  }
}

init();
