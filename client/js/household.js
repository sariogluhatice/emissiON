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
      const PROG_COLORS = {
        on_track: 'var(--color-primary)', at_risk: '#f59e0b', off_track: 'var(--color-error)',
        successful: '#16a34a', failed: 'var(--color-error)',
        no_data: 'var(--color-text-muted)', no_baseline: '#9ca3af',
      };
      const PROG_LABELS = {
        on_track: 'Yolunda', at_risk: 'Risk Altında', off_track: 'Geride',
        successful: 'Başarılı', failed: 'Başarısız',
        no_data: 'Veri Bekleniyor', no_baseline: 'Başlangıç Verisi Bekleniyor',
      };
      const current  = parseFloat(t.current_amount);
      const target   = parseFloat(t.target_amount);
      const baseline = t.baseline_amount != null ? parseFloat(t.baseline_amount) : null;
      const color    = PROG_COLORS[t.progress_status] || 'var(--color-border)';
      const badge    = PROG_LABELS[t.progress_status] || '';
      let barPct = 0;
      if (baseline != null && baseline > target) {
        barPct = Math.max(0, Math.min(100, Math.round((baseline - current) / (baseline - target) * 100)));
      } else if (target > 0) {
        barPct = current <= target ? 100 : 0;
      }
      progressHtml = `
        <div style="margin-top:6px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-text-muted);margin-bottom:3px;">
            <span>Güncel: ${current.toFixed(1)} kg / Hedef: ${target.toFixed(1)} kg CO₂e</span>
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

// ── Goal Progress Bar ─────────────────────────────────────────────────────────
function renderGoalProgress(household, currentMonthTotal) {
  const card = document.getElementById('hhGoalProgressCard');
  if (!card || !household.monthly_target) return;

  const target  = parseFloat(household.monthly_target);
  const used    = currentMonthTotal ?? 0;
  const pct     = Math.min(100, Math.round((used / target) * 100));
  const fill    = document.getElementById('hhGoalBarFill');
  const pctEl   = document.getElementById('hhGoalPct');
  const usedEl  = document.getElementById('hhGoalUsed');
  const targetEl = document.getElementById('hhGoalTarget');

  card.style.display = '';
  if (pctEl)   pctEl.textContent   = `${pct}%`;
  if (usedEl)  usedEl.textContent  = `${used.toFixed(1)} kg kullanıldı`;
  if (targetEl) targetEl.textContent = `Hedef: ${target.toFixed(0)} kg`;
  if (fill) {
    requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
    fill.className = `hh-goal-bar-fill ${pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'safe'}`;
  }
}

// ── Leaderboard (bu ay) ───────────────────────────────────────────────────────
function renderLeaderboard(memberBreakdown) {
  const container = document.getElementById('hhLeaderboard');
  if (!container) return;

  if (!memberBreakdown?.length) {
    container.innerHTML = '<div class="hh-empty"><p>Yeterli veri yok.</p></div>';
    return;
  }

  const sorted = [...memberBreakdown].sort((a, b) => a.current_month_emissions - b.current_month_emissions);
  const max    = Math.max(...sorted.map(m => m.current_month_emissions), 0.01);
  const medals = ['🥇', '🥈', '🥉'];

  container.innerHTML = sorted.map((m, i) => {
    const pct = Math.round((m.current_month_emissions / max) * 100);
    const isYou = m.is_current_user;
    return `
      <div class="hh-leaderboard-row${isYou ? ' hh-lb-row-you' : ''}">
        <span class="hh-lb-rank">${medals[i] ?? `#${i+1}`}</span>
        <span class="hh-lb-name">${m.name ?? 'Üye'}${isYou ? ' <span style="font-size:10px;color:var(--color-primary);font-weight:500;">(Sen)</span>' : ''}</span>
        <div class="hh-lb-bar-wrap">
          <div class="hh-lb-bar" style="width:${pct}%"></div>
        </div>
        <span class="hh-lb-amount">${m.current_month_emissions.toFixed(1)} kg</span>
      </div>`;
  }).join('');
}

// ── Activity Feed ─────────────────────────────────────────────────────────────
function renderActivityFeed(memberBreakdown) {
  const container = document.getElementById('hhActivityFeed');
  if (!container) return;

  if (!memberBreakdown?.length) {
    container.innerHTML = '<div class="hh-empty"><p>Bu ay henüz aktivite yok.</p></div>';
    return;
  }

  const sorted = [...memberBreakdown]
    .filter(m => m.current_month_emissions > 0)
    .sort((a, b) => b.current_month_emissions - a.current_month_emissions);

  if (!sorted.length) {
    container.innerHTML = '<div class="hh-empty"><p>Bu ay henüz kayıt yok.</p></div>';
    return;
  }

  container.innerHTML = sorted.map(m => {
    const initials = (m.name ?? '?').charAt(0).toUpperCase();
    const isYou    = m.is_current_user;
    return `
      <div class="hh-activity-item">
        <div class="hh-activity-avatar" style="${isYou ? 'background:var(--color-secondary);' : ''}">${initials}</div>
        <div class="hh-activity-desc">
          <span class="hh-activity-name">${m.name ?? 'Üye'}</span>
          ${isYou ? ' <span style="font-size:11px;color:var(--color-text-muted)">(sen)</span>' : ''}
          <span style="color:var(--color-text-muted)"> bu ay toplam</span>
        </div>
        <span class="hh-activity-amount">${m.current_month_emissions.toFixed(1)} kg CO₂</span>
      </div>`;
  }).join('');
}

// ── Comparison section (hane içi) ────────────────────────────────────────────
function renderComparison(comp) {
  if (!comparisonEl) return;

  if (!comp || !comp.comparison_available) {
    comparisonEl.innerHTML = `<div class="hh-empty"><div class="hh-empty-icon">📈</div><p>Hane içi karşılaştırma için yeterli veri bulunmuyor.</p></div>`;
    return;
  }

  const { member_breakdown, current_month_total, previous_month_total, month_change_pct, task_stats } = comp;

  const changeColor = month_change_pct == null ? 'var(--color-text-muted)'
    : month_change_pct < 0 ? '#16a34a'
    : 'var(--color-error)';
  const changeSign  = month_change_pct != null && month_change_pct > 0 ? '+' : '';
  const changeDisp  = month_change_pct != null ? `${changeSign}${month_change_pct}%` : '—';

  const maxEm = member_breakdown.length
    ? Math.max(...member_breakdown.map(m => m.current_month_emissions), 0.01)
    : 1;

  const memberRows = member_breakdown.map(m => {
    const pct = Math.round(m.current_month_emissions / maxEm * 100);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:5px 0;">
        <span style="font-size:13px;min-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.name ?? 'Üye'}</span>
        <div style="flex:1;background:var(--color-border);border-radius:99px;height:6px;">
          <div style="width:${pct}%;background:var(--color-primary);height:100%;border-radius:99px;"></div>
        </div>
        <span style="font-size:12px;color:var(--color-text-muted);min-width:58px;text-align:right;">${m.current_month_emissions.toFixed(1)} kg</span>
      </div>`;
  }).join('');

  const totalTasks = (task_stats.pending || 0) + (task_stats.in_progress || 0) + (task_stats.completed || 0);
  const completedPct = totalTasks > 0 ? Math.round(task_stats.completed / totalTasks * 100) : 0;

  const taskHtml = totalTasks > 0 ? `
    <div style="margin-top:14px;">
      <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Görev Durumu</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <span style="font-size:12px;padding:3px 10px;border-radius:20px;background:var(--color-border);color:var(--color-text-muted);">${task_stats.pending} Bekliyor</span>
        <span style="font-size:12px;padding:3px 10px;border-radius:20px;background:#dbeafe;color:#1d4ed8;">${task_stats.in_progress} Devam Ediyor</span>
        <span style="font-size:12px;padding:3px 10px;border-radius:20px;background:#dcfce7;color:#16a34a;">${task_stats.completed} Tamamlandı · %${completedPct}</span>
      </div>
    </div>` : '';

  comparisonEl.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="flex:1;min-width:100px;background:rgba(0,0,0,0.03);border-radius:8px;padding:10px 12px;">
        <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:3px;">Bu Ay</div>
        <div style="font-size:20px;font-weight:700;">${current_month_total.toFixed(1)}</div>
        <div style="font-size:11px;color:var(--color-text-muted);">kg CO₂e</div>
      </div>
      <div style="flex:1;min-width:100px;background:rgba(0,0,0,0.03);border-radius:8px;padding:10px 12px;">
        <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:3px;">Geçen Ay</div>
        <div style="font-size:20px;font-weight:700;">${previous_month_total.toFixed(1)}</div>
        <div style="font-size:11px;color:var(--color-text-muted);">kg CO₂e</div>
      </div>
      <div style="flex:1;min-width:100px;background:rgba(0,0,0,0.03);border-radius:8px;padding:10px 12px;">
        <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:3px;">Değişim</div>
        <div style="font-size:20px;font-weight:700;color:${changeColor};">${changeDisp}</div>
        <div style="font-size:11px;color:${changeColor};">${month_change_pct == null ? 'Veri yok' : month_change_pct < 0 ? 'Azaldı' : month_change_pct === 0 ? 'Değişim yok' : 'Arttı'}</div>
      </div>
    </div>
    ${member_breakdown.length ? `
    <div style="margin-bottom:4px;">
      <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Bu Ay Üye Bazında</div>
      ${memberRows}
    </div>` : ''}
    ${taskHtml}`;
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
      const comp = compResult.value.data?.comparison;
      renderComparison(comp);
      if (comp?.member_breakdown) {
        renderLeaderboard(comp.member_breakdown);
        renderActivityFeed(comp.member_breakdown);
      }
      if (comp?.current_month_total != null) {
        renderGoalProgress(household, comp.current_month_total);
      }
    } else {
      comparisonEl.innerHTML = `<div class="hh-empty"><p>Karşılaştırma yüklenemedi.</p></div>`;
      const lb = document.getElementById('hhLeaderboard');
      if (lb) lb.innerHTML = '<div class="hh-empty"><p>Yüklenemedi.</p></div>';
      const af = document.getElementById('hhActivityFeed');
      if (af) af.innerHTML = '<div class="hh-empty"><p>Yüklenemedi.</p></div>';
    }

  } catch (err) {
    hide(loadingEl);
    showToast('Hata', err.message, 'error');
  }
}

init();
