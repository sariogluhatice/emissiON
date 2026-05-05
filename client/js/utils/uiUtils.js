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

/** Get emoji for specific categories */
export function categoryEmoji(cat) {
  const map = {
    energy:    '⚡',
    water:     '💧',
    gas:       '🔥',
    transport: '🚗',
    materials: '📦',
    waste:     '🗑️',
    food:      '🍽️',
    shopping:  '🛍️',
    // legacy keys
    Transport: '🚗',
    Energy:    '⚡',
    Flight:    '✈️',
    Shopping:  '🛍️',
    Other:     '🛍️',
    Food:      '🍽️',
    Waste:     '🗑️',
    Water:     '💧',
    Paper:     '📦',
    Transportation: '🚗',
  };

  if (map[cat]) return map[cat];

  const lower = String(cat).toLowerCase();
  if (lower.includes('flight') || lower.includes('uçuş')) return '✈️';
  if (lower.includes('gas') || lower.includes('doğalgaz'))  return '🔥';
  if (lower.includes('electric') || lower.includes('elektrik')) return '⚡';
  if (lower.includes('shop') || lower.includes('retail') || lower.includes('alışveriş')) return '🛍️';
  if (lower.includes('car') || lower.includes('diesel') || lower.includes('araç'))       return '🚗';
  if (lower.includes('waste') || lower.includes('atık'))    return '🗑️';
  if (lower.includes('water') || lower.includes('su'))      return '💧';
  if (lower.includes('paper') || lower.includes('kağıt'))   return '📦';
  if (lower.includes('food') || lower.includes('gıda'))     return '🍽️';

  return '📌';
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
    const cat = e.source || 'Other';
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
