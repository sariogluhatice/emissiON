/**
 * client/js/emissions.js
 * 
 * Emisyon kayıtlarını tablo halinde listeler. Arama ve kategori 
 * bazlı filtreleme mantığını yönetir.
 */

import {
  getCurrentUser,
  renderTopbarUser,
  bindLogout,
  getSortedEmissions,
  categoryEmoji,
  formatDate,
} from './utils/mockData.js';

// Kullanıcı ve sayfa başlangıç ayarları
const user = getCurrentUser();
renderTopbarUser(user);
bindLogout();

// Veri Havuzu (Mock ve Yerel Veriler)
let allEmissions = getSortedEmissions();
let pendingDeleteId = null;

// DOM Elemanları Referansları
const tbody          = document.getElementById('emissionsTableBody');
const searchInput    = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const totalShown     = document.getElementById('totalShown');
const totalCO2       = document.getElementById('totalCO2');
const deleteModal    = document.getElementById('deleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn  = document.getElementById('cancelDeleteBtn');

/** Tabloyu mevcut filtrelere göre yeniden render eder */
function render() {
  const query    = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;

  // Arama kriterlerine göre veriyi filtreleme
  const filtered = allEmissions.filter(e => {
    const matchesSearch =
      !query ||
      e.description.toLowerCase().includes(query) ||
      e.category.toLowerCase().includes(query);
    const matchesCat = !category || e.category === category;
    return matchesSearch && matchesCat;
  });

  totalShown.textContent = filtered.length;
  totalCO2.textContent   = filtered.reduce((s, e) => s + e.amount, 0).toFixed(1);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No entries found for your criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(e => `
    <tr>
      <td>${formatDate(e.date)}</td>
      <td>${categoryEmoji(e.category)} ${e.category}</td>
      <td>${e.description}</td>
      <td><strong>${e.amount.toFixed(1)}</strong></td>
      <td style="display:flex;gap:6px;">
        <a href="add-emission.html?edit=${e.id}" class="btn-action btn-edit">Edit</a>
        <button class="btn-action btn-delete" data-id="${e.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  // Silme Butonları Dinleyicisi
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingDeleteId = Number(btn.dataset.id);
      deleteModal.style.display = 'flex';
    });
  });
}

// Olay Dinleyicileri (Event Listeners)
searchInput.addEventListener('input', render);
categoryFilter.addEventListener('change', render);

cancelDeleteBtn.addEventListener('click', () => {
  deleteModal.style.display = 'none';
  pendingDeleteId = null;
});

confirmDeleteBtn.addEventListener('click', () => {
  if (pendingDeleteId !== null) {
    /* HATICE'S PART: API Entegrasyon Noktası: DELETE /emissions/:id */
    // await api.delete(`/emissions/${pendingDeleteId}`);

    // [PEER REVIEW FIX] localStorage senkronizasyonu eklendi
    const local = JSON.parse(localStorage.getItem('localEmissions') || '[]');
    const updatedLocal = local.filter(e => e.id !== pendingDeleteId);
    localStorage.setItem('localEmissions', JSON.stringify(updatedLocal));

    allEmissions = allEmissions.filter(e => e.id !== pendingDeleteId);
    pendingDeleteId = null;
  }
  deleteModal.style.display = 'none';
  render();
});

// Modal dışına tıklandığında pencereyi kapatır
deleteModal.addEventListener('click', e => {
  if (e.target === deleteModal) {
    deleteModal.style.display = 'none';
    pendingDeleteId = null;
  }
});

// Sayfa ilk yüklendiğinde tabloyu render et
render();
