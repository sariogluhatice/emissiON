import { emissionService } from './api/emissionService.js';
import { renderLayout } from './layout.js';
import { categoryEmoji, formatDate } from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-emissions', title: 'Emisyon Kayıtları' });
if (!user) throw new Error('redirect');

// Veri Durumu (State)
let allEmissions = [];
let pendingDeleteId = null;

// DOM Elemanları
const tbody          = document.getElementById('emissionsTableBody');
const searchInput    = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const totalShown     = document.getElementById('totalShown');
const totalCO2       = document.getElementById('totalCO2');
const deleteModal    = document.getElementById('deleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn  = document.getElementById('cancelDeleteBtn');

/** API'den verileri çek */
async function loadData() {
  try {
    const { records } = await emissionService.getAll();
    allEmissions = records;
    render();
  } catch (err) {
    console.error('Emisyonlar yüklenemedi:', err);
  }
}

/** Tabloyu filtrelerle birlikte render et */
function render() {
  const query    = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;

  const filtered = allEmissions.filter(e => {
    const matchesSearch = !query || (
      e.source.toLowerCase().includes(query) ||
      String(e.date || '').toLowerCase().includes(query) ||
      String(parseFloat(e.amount || 0).toFixed(1)).includes(query) ||
      'karbon aktivite kaydı'.includes(query)
    );
    const matchesCat = !category || e.source === category;
    return matchesSearch && matchesCat;
  });

  if (totalShown) totalShown.textContent = filtered.length;
  if (totalCO2)   totalCO2.textContent   = filtered.reduce((s, e) => s + parseFloat(e.amount), 0).toFixed(1);

  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Kriterlerinize uygun bir kayıt bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(e => `
    <tr>
      <td>${formatDate(e.date)}</td>
      <td>${categoryEmoji(e.source)} ${e.source}</td>
      <td>Karbon aktivite kaydı</td>
      <td><strong>${parseFloat(e.amount).toFixed(1)}</strong></td>
      <td style="display:flex;gap:10px;align-items:center;">
        <a href="add-emission.html?id=${e.id}" class="btn-action btn-edit" title="Edit Entry">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
          Düzenle
        </a>
        <button class="btn-action btn-delete" data-id="${e.id}" title="Delete Entry">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          Sil
        </button>
      </td>
    </tr>
  `).join('');

  // Silme İşlemleri
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingDeleteId = btn.dataset.id;
      if (deleteModal) deleteModal.style.display = 'flex';
    });
  });
}

// Olay Dinleyiciler (Event Listeners)
searchInput?.addEventListener('input', render);
categoryFilter?.addEventListener('change', render);

cancelDeleteBtn?.addEventListener('click', () => {
  if (deleteModal) deleteModal.style.display = 'none';
  pendingDeleteId = null;
});

confirmDeleteBtn?.addEventListener('click', async () => {
  if (pendingDeleteId) {
    try {
      await emissionService.remove(pendingDeleteId);
      await loadData(); // Refresh list
    } catch (err) {
      alert('Kayıt silinemedi: ' + err.message);
    }
  }
  if (deleteModal) deleteModal.style.display = 'none';
  pendingDeleteId = null;
});

// İlk Yükleme
loadData();
