import { emissionService } from './api/emissionService.js';
import {
  getCurrentUser,
  renderTopbarUser,
  bindLogout,
  calculateStats,
} from './utils/uiUtils.js';

// Kurulum
const user = getCurrentUser();
if (!user) {
  window.location.href = 'login.html';
}
renderTopbarUser(user);
bindLogout();

// Avatar & Bilgiler
const initial = (user.name || user.email || '?').charAt(0).toUpperCase();

document.getElementById('profileAvatarCircle').textContent = initial;
document.getElementById('profileName').textContent         = user.name  || '—';
document.getElementById('profileEmail').textContent        = user.email || '—';
document.getElementById('profileRole').textContent         = user.role  || 'user';

const sinceDate = user.created_at || new Date().toISOString();
const since = new Date(sinceDate).toLocaleDateString('tr-TR', { year:'numeric', month:'long' });
document.getElementById('profileSince').textContent = `${since} tarihinden beri üye`;

document.getElementById('profileNameInput').value    = user.name  || '';
document.getElementById('profileEmailInput').value   = user.email || '';
document.getElementById('profileRoleInput').value    = user.role  || 'user';
document.getElementById('profileCreatedInput').value = since;

// Gerçek İstatistik Entegrasyonu
async function loadProfileStats() {
  try {
    const { records } = await emissionService.getAll();
    const stats = calculateStats(records);
    
    document.getElementById('profileStatTotal').textContent   = stats.total;
    document.getElementById('profileStatMonth').textContent   = stats.month;
    document.getElementById('profileStatEntries').textContent = stats.entries;
  } catch (err) {
    console.error('Profil istatistikleri yüklenemedi:', err);
  }
}

loadProfileStats();
