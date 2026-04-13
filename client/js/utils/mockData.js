/**
 * js/utils/mockData.js
 * 
 * Merkezi veri yönetim modülü. Uygulama genelinde paylaşılan 
 * mock verileri ve yardımcı fonksiyonları içerir.
 * 
 * Mimari: Durum yönetimi simülasyonu için Singleton/Module pattern kullanılmıştır.
 */
import { TokenManager } from '../api/tokenManager.js';

/** Demo kullanıcı bilgileri */
export const MOCK_USER = {
  id: 1,
  name: 'Sedef Kazan',
  email: 'sedef@emission.dev',
  role: 'user',
  created_at: '2025-03-15T10:00:00Z',
};

/** Başlangıç verileri - Veritabanı bağlandığında bu dizi boşaltılacaktır. */
export const MOCK_EMISSIONS = [
  { id: 1, category: 'Transport', description: 'Uçuş IST → BER', amount: 320.5, date: '2025-04-01', status: 'verified' },
  { id: 2, category: 'Energy', description: 'Aylık elektrik faturası', amount: 85.2, date: '2025-04-03', status: 'verified' },
  { id: 3, category: 'Food', description: 'Haftalık mutfak (et)', amount: 22.8, date: '2025-04-05', status: 'pending' },
  { id: 4, category: 'Transport', description: 'İşe gidiş (Araç), 5 gün', amount: 14.4, date: '2025-04-07', status: 'verified' },
  { id: 5, category: 'Shopping', description: 'Yeni laptop alımı', amount: 400.0, date: '2025-04-08', status: 'pending' },
];

/** localStorage'dan yerel kayıtları getirir */
export function getLocalEmissions() {
  try {
    return JSON.parse(localStorage.getItem('localEmissions') || '[]');
  } catch {
    return [];
  }
}

/** Tüm kayıtları birleştirir ve tarihe göre azalan sırada sıralar */
export function getSortedEmissions() {
  const all = [...MOCK_EMISSIONS, ...getLocalEmissions()];
  return all.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** İstatistiksel verileri hesaplar (Toplam emisyon, bu ayki toplam vb.) */
export function getStats(emissions = MOCK_EMISSIONS) {
  const total = emissions.reduce((s, e) => s + e.amount, 0);

  const now = new Date();
  const monthEmissions = emissions.filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const month = monthEmissions.reduce((s, e) => s + e.amount, 0);

  // En yüksek emisyon kategorisini bulur
  const catTotals = {};
  emissions.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  return {
    total: total.toFixed(1),
    month: month.toFixed(1),
    entries: emissions.length,
    topCat,
  };
}

/** Duruma göre badge sınıfını döndürür */
export function statusBadge(status) {
  const map = { verified: 'badge-green', pending: 'badge-orange', rejected: 'badge-red' };
  return map[status] ?? 'badge-blue';
}

/** Kategoriye göre emoji döndürür */
export function categoryEmoji(cat) {
  const map = { Transport: '🚗', Energy: '⚡', Food: '🍽', Shopping: '🛍', Other: '📦' };
  return map[cat] ?? '📌';
}

/** Tarih formatlama yardımcı fonksiyonu */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR');
}

/** Mevcut oturum açmış kullanıcıyı getirir */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : MOCK_USER;
  } catch {
    return MOCK_USER;
  }
}

/** Logout: Token ve kullanıcı bilgilerini temizler */
export function logout() {
  TokenManager.remove();
  localStorage.removeItem('user');
  window.location.href = './login.html';
}

/** Üst bar (topbar) kullanıcı alanını günceller */
export function renderTopbarUser(user) {
  const initEl = document.getElementById('userInitials');
  const nameEl = document.getElementById('userName');
  if (initEl) initEl.textContent = (user.name || '?').charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = user.name || user.email || '—';
}

/** Logout butonuna dinleyici ekler */
export function bindLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

/** Modern Toast bildirimi gösterimi (Sunum için eklenmiştir) */
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
