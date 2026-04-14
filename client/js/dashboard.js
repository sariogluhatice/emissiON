/**
 * js/dashboard.js
 * 
 * Dashboard sayfası için veri işleme ve görselleştirme mantığını içerir.
 * @author Sedef Kazan, Hatice
 */

import { TokenManager } from './api/tokenManager.js';
import { emissionService } from './api/emissionService.js';
import {
  getCurrentUser,
  renderTopbarUser,
  bindLogout,
  getSortedEmissions,
  getStats,
  categoryEmoji,
  formatDate,
} from './utils/mockData.js';

// Guard: redirect to login if not authenticated
if (!TokenManager.exists()) {
  window.location.href = 'login.html';
}

// Başlangıç Ayarları: Kullanıcı bilgileri ve Logout butonu
const user = getCurrentUser();
renderTopbarUser(user);
bindLogout();

// Hoş geldin mesajını günceller
const welcomeEl = document.getElementById('welcomeName');
if (welcomeEl) welcomeEl.textContent = (user.name || '').split(' ')[0] || 'there';

const recordList = document.getElementById('recordList');
const recentTableBody = document.getElementById('recentTableBody');

// Tarih formatlama yardımcı fonksiyonu
function formatDateDisplay(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// CRUD Kartı Oluşturma
function createCard(record) {
  const card = document.createElement('div');
  card.className  = 'record-card';
  card.dataset.id = record.id;

  card.innerHTML = `
    <div class="record-info">
      <span class="record-source">${record.source || record.category}</span>
      <span class="record-meta">${formatDateDisplay(record.date)}</span>
    </div>
    <span class="record-amount">${parseFloat(record.amount).toFixed(2)} kg CO₂</span>
    <div class="record-actions">
      <a href="record-form.html?id=${record.id}" class="link-btn">Edit</a>
      <button class="link-btn" style="color:var(--color-error)" data-delete="${record.id}">Delete</button>
    </div>
  `;

  return card;
}

// CRUD Kayıtlarını Yükle
async function loadRecords() {
  try {
    const { records } = await emissionService.getAll();
    
    if (!recordList) return; // Sayfa layout farklıysa
    
    recordList.innerHTML = '';

    if (records.length === 0) {
      const emptyState = document.getElementById('emptyState');
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = 'none';
    
    records.forEach(r => recordList.appendChild(createCard(r)));
  } catch (err) {
    console.error('Failed to load records:', err);
  }
}

// CRUD Silme İşlemi
if (recordList) {
  recordList.addEventListener('click', async (e) => {
    const id = e.target.dataset.delete;
    if (!id) return;

    if (!confirm('Delete this record?')) return;

    try {
      await emissionService.remove(id);
      document.querySelector(`[data-id="${id}"]`)?.remove();

      const emptyState = document.getElementById('emptyState');
      if (recordList.children.length === 0 && emptyState) {
        emptyState.style.display = 'block';
      }
    } catch {
      alert('Failed to delete record.');
    }
  });
}

// Dashboard İstatistikleri (Sedef)
async function initDashboard() {
  try {
    const { records } = await emissionService.getAll();
    const stats = getStats(records);

    // İstatistik kartlarını DOM elementlerine bağla
    if (document.getElementById('statTotal')) document.getElementById('statTotal').textContent = stats.total;
    if (document.getElementById('statMonth')) document.getElementById('statMonth').textContent = stats.month;
    if (document.getElementById('statEntries')) document.getElementById('statEntries').textContent = stats.entries;
    if (document.getElementById('statTopCat')) document.getElementById('statTopCat').textContent = stats.topCat;

    initChart(records);
    renderRecentTable(records.slice(0, 5));
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

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

  // Boş veri durumunda grafiğin patlamasını engelle
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

// Son Kayıtlar Tablosu Rendering (İlk 5 Kayıt)
function renderRecentTable(emissions) {
  const tbody = document.getElementById('recentTableBody');
  if (!tbody) return;

  if (emissions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Henüz kayıt yok. <a href="add-emission.html">İlk kaydı ekle →</a></td></tr>`;
  } else {
    tbody.innerHTML = emissions.map(e => `
      <tr>
        <td>${formatDate(e.date)}</td>
        <td>${categoryEmoji(e.category)} ${e.category}</td>
        <td>${e.description}</td>
        <td><strong>${e.amount.toFixed(1)}</strong></td>
      </tr>
    `).join('');
  }
}

// Başlat
initDashboard();
loadRecords();
