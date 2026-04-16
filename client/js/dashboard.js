import { TokenManager } from './api/tokenManager.js';
import { emissionService } from './api/emissionService.js';
import {
  getCurrentUser,
  renderTopbarUser,
  bindLogout,
  calculateStats,
  categoryEmoji,
  formatDate,
} from './utils/uiUtils.js';

// Guard: redirect to login if not authenticated
if (!TokenManager.exists()) {
  window.location.href = 'login.html';
}

// Başlangıç Ayarları
const user = getCurrentUser();
renderTopbarUser(user);
bindLogout();

const welcomeEl = document.getElementById('welcomeName');
if (welcomeEl) welcomeEl.textContent = user?.name ? user.name.split(' ')[0] : 'there';

const recordList = document.getElementById('recordList');

// CRUD Kartı Oluşturma
function createCard(record) {
  const card = document.createElement('div');
  card.className  = 'record-card';
  card.dataset.id = record.id;

  card.innerHTML = `
    <div class="record-info">
      <span class="record-source">${categoryEmoji(record.source)} ${record.source}</span>
      <span class="record-meta">${formatDate(record.date)}</span>
    </div>
    <span class="record-amount">${parseFloat(record.amount).toFixed(1)} kg CO₂</span>
    <div class="record-actions" style="display:flex; gap:10px;">
      <a href="add-emission.html?id=${record.id}" class="btn-action btn-edit" title="Edit Entry">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
        Edit
      </a>
      <button class="btn-action btn-delete" data-delete="${record.id}" title="Delete Entry">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        Delete
      </button>
    </div>
  `;

  return card;
}

// CRUD Kayıtlarını Yükle ve İstatistikleri Güncelle
async function initDashboard() {
  try {
    const { records } = await emissionService.getAll();
    
    // 1. İstatistikleri Hesapla ve Göster
    const stats = calculateStats(records);
    if (document.getElementById('statTotal'))   document.getElementById('statTotal').textContent   = stats.total;
    if (document.getElementById('statMonth'))   document.getElementById('statMonth').textContent   = stats.month;
    if (document.getElementById('statEntries')) document.getElementById('statEntries').textContent = stats.entries;
    if (document.getElementById('statTopCat'))  document.getElementById('statTopCat').textContent  = stats.topCat;

    // 2. Grafiği Başlat
    initChart(records);

    // 3. Kayıt Listesini Render Et
    if (recordList) {
      recordList.innerHTML = '';
      if (records.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
      } else {
        document.getElementById('emptyState').style.display = 'none';
        records.forEach(r => recordList.appendChild(createCard(r)));
      }
    }

  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

// Silme İşlemi
if (recordList) {
  recordList.addEventListener('click', async (e) => {
    const id = e.target.dataset.delete;
    if (!id) return;

    if (!confirm('Delete this record?')) return;

    try {
      await emissionService.remove(id);
      await initDashboard(); // Re-fetch to update stats and list
    } catch {
      alert('Failed to delete record.');
    }
  });
}

function initChart(data) {
  const ctx = document.getElementById('emissionChart');
  if (!ctx) return;

  const categories = {};
  data.forEach(e => {
    const cat = e.source || 'Other';
    categories[cat] = (categories[cat] || 0) + parseFloat(e.amount);
  });

  const labels = Object.keys(categories);
  const values = Object.values(categories);

  if (labels.length === 0) {
    ctx.parentElement.innerHTML = `
      <div style="text-align:center; padding: 40px 20px; color: var(--color-text-muted);">
        <p style="font-size:32px; margin-bottom:12px;">🌱</p>
        <p style="font-size:14px; font-weight:500;">No emission records yet.</p>
        <p style="font-size:13px; margin-top:4px;">Add your first entry to see visualizations →</p>
      </div>`;
    return;
  }

  // Clear existing chart if any (Chart.js works better this way)
  if (window.myChart) window.myChart.destroy();

  window.myChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#6b7280'],
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right' } },
      cutout: '70%'
    }
  });
}

initDashboard();
