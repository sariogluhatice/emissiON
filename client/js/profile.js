/**
 * client/js/profile.js
 * 
 * Profil sayfası verilerini mockData modülünden çeker ve DOM elementlerini günceller.
 * Entegrasyon: mockData yerine gerçek bir UserApiClient ile değiştirilmeye hazırdır.
 */

import {
  getCurrentUser,
  renderTopbarUser,
  bindLogout,
  getSortedEmissions,
  getStats,
} from './utils/mockData.js';

// Başlangıç: Kullanıcı ve Navigasyon Ayarları
const user = getCurrentUser();
renderTopbarUser(user);
bindLogout();

// Avatar Kartı Rendering
const initial = (user.name || user.email || '?').charAt(0).toUpperCase();

document.getElementById('profileAvatarCircle').textContent = initial;
document.getElementById('profileName').textContent         = user.name  || '—';
document.getElementById('profileEmail').textContent        = user.email || '—';
document.getElementById('profileRole').textContent         = user.role  || 'user';

// Üyelik tarihini formatlar
const since = user.created_at
  ? new Date(user.created_at).toLocaleDateString('en-GB', { year:'numeric', month:'long' })
  : '—';
document.getElementById('profileSince').textContent = `Member since ${since}`;

// Bilgi Formu Rendering (Readonly modda)
document.getElementById('profileNameInput').value    = user.name  || '';
document.getElementById('profileEmailInput').value   = user.email || '';
document.getElementById('profileRoleInput').value    = user.role  || 'user';
document.getElementById('profileCreatedInput').value = since;

// Emisyon Özeti Gösterimi
/* HATICE'S PART: API Entegrasyon Noktası - İstatistikleri doğrudan backend'den çekin */
// const stats = await api.get('/users/stats');

const stats = getStats(getSortedEmissions());
document.getElementById('profileStatTotal').textContent   = stats.total;
document.getElementById('profileStatMonth').textContent   = stats.month;
document.getElementById('profileStatEntries').textContent = stats.entries;
