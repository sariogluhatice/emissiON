/**
 * js/dashboard.js
 * 
 * Dashboard sayfası için veri işleme ve görselleştirme mantığını içerir.
 * @author Sedef Kazan
 */

import {
  getCurrentUser,
  renderTopbarUser,
  bindLogout,
  getSortedEmissions,
  getStats,
  categoryEmoji,
  formatDate,
} from './utils/mockData.js';

// Başlangıç Ayarları: Kullanıcı bilgileri ve Logout butonu
const user = getCurrentUser();
renderTopbarUser(user);
bindLogout();

// Hoş geldin mesajını günceller
const welcomeEl = document.getElementById('welcomeName');
if (welcomeEl) welcomeEl.textContent = (user.name || '').split(' ')[0] || 'there';

// Veri Hazırlama ve İstatistiklerin Hesaplanması
const emissions = getSortedEmissions();
const stats = getStats(emissions);

// İstatistik kartlarını DOM elementlerine bağlar
document.getElementById('statTotal').textContent   = stats.total;
document.getElementById('statMonth').textContent   = stats.month;
document.getElementById('statEntries').textContent = stats.entries;
document.getElementById('statTopCat').textContent  = stats.topCat;

/** 
 * Grafik Oluşturma (Sunum Özelliği - Chart.js) 
 */
function initChart(data) {
  const ctx = document.getElementById('emissionChart');
  if (!ctx) return;

  // Kategori bazlı toplam emisyon değerlerini hesaplar
  const categories = {};
  data.forEach(e => {
    categories[e.category] = (categories[e.category] || 0) + e.amount;
  });

  const labels = Object.keys(categories);
  const values = Object.values(categories);

  // [PEER REVIEW FIX] Boş veri durumunda grafiğin patlamasını engelle
  if (labels.length === 0) {
    const parent = ctx.parentElement;
    if (parent) {
      parent.innerHTML = `
        <div style="text-align:center; padding: 40px 20px; color: var(--color-text-muted);">
          <p style="font-size:32px; margin-bottom:12px;">🌱</p>
          <p style="font-size:14px; font-weight:500;">Henüz emisyon kaydı bulunmuyor.</p>
          <p style="font-size:13px; margin-top:4px;">Verilerinizi görselleştirmek için <a href="add-emission.html" style="color:var(--color-primary);font-weight:600;">ilk girişinizi yapın →</a></p>
        </div>`;
    }
    return;
  }

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: [
          '#6366f1', // Transport
          '#10b981', // Energy
          '#f59e0b', // Food
          '#ef4444', // Shopping
          '#6b7280'  // Other
        ],
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' }
      },
      cutout: '70%'
    }
  });
}

// Grafiği mevcut emisyon verileriyle başlatır
initChart(emissions);

// Son Kayıtlar Tablosu Rendering (İlk 5 Kayıt)
const tbody = document.getElementById('recentTableBody');
const recent = emissions.slice(0, 5);

if (recent.length === 0) {
  tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Henüz kayıt yok. <a href="add-emission.html">İlk kaydı ekle →</a></td></tr>`;
} else {
  tbody.innerHTML = recent.map(e => `
    <tr>
      <td>${formatDate(e.date)}</td>
      <td>${categoryEmoji(e.category)} ${e.category}</td>
      <td>${e.description}</td>
      <td><strong>${e.amount.toFixed(1)}</strong></td>
    </tr>
  `).join('');
}
