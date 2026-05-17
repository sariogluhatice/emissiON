/**
 * js/utils/uiUtils.js
 * 
 * Centralized UI utility functions for the EmissiON project.
 * Extracted from original mockData.js for production use.
 */
import { TokenManager } from '../api/tokenManager.js';

/** Logout: Token and user info cleanup */
export function logout() {
  TokenManager.remove();
  localStorage.removeItem('user');
  window.location.href = './login.html';
}

/** Get currently logged in user from localStorage */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Update topbar user initials and name */
export function renderTopbarUser(user) {
  if (!user) return;
  const initEl = document.getElementById('userInitials');
  const nameEl = document.getElementById('userName');
  if (initEl) initEl.textContent = (user.name || '?').charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = user.name || user.email || '—';
}

/** Bind logout event to specific button */
export function bindLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

/** Format ISO date to local display */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR');
}


/** Calculate summary statistics from record list */
export function calculateStats(records = []) {
  const total = records.reduce((s, e) => s + parseFloat(e.amount), 0);

  const now = new Date();
  const monthRecords = records.filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const month = monthRecords.reduce((s, e) => s + parseFloat(e.amount), 0);

  const catTotals = {};
  records.forEach(e => { 
    const cat = e.source || 'Diğer';
    catTotals[cat] = (catTotals[cat] || 0) + parseFloat(e.amount);
  });
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  return {
    total: total.toFixed(1),
    month: month.toFixed(1),
    entries: records.length,
    topCat,
  };
}

// ── Task workflow status helpers (shared by household.js + household-tasks.js) ─
const _TASK_STATUS_LABELS = {
  pending:     'Bekliyor',
  in_progress: 'Devam Ediyor',
  completed:   'Tamamlandı',
  cancelled:   'İptal Edildi',
};
const _TASK_STATUS_CLASSES = {
  pending:     'pending',
  in_progress: 'in-progress',
  completed:   'completed',
  cancelled:   'cancelled',
};
export function getTaskStatusLabel(status) { return _TASK_STATUS_LABELS[status]  || status; }
export function getTaskStatusClass(status) { return _TASK_STATUS_CLASSES[status] || 'pending'; }

/** Modern Toast notification */
export function showToast(title, message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';

  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      <span class="toast-title">${title}</span>
      <span class="toast-msg">${message}</span>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
