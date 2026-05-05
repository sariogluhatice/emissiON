import { emissionService } from './api/emissionService.js';
import { renderLayout } from './layout.js';
import { formatDate } from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-emissions', title: 'Emisyon Kayıtları' });
if (!user) throw new Error('redirect');

// --- Merkezi Label Mapping ---

const CATEGORY_LABELS = {
  energy:    'Enerji',
  water:     'Su',
  gas:       'Doğalgaz',
  transport: 'Ulaşım',
  materials: 'Malzeme',
  waste:     'Atık',
  food:      'Gıda',
  other:     'Diğer / Alışveriş',
};

const ACTIVITY_TYPE_LABELS = {
  electricity:   'Elektrik',
  natural_gas:   'Doğalgaz',
  gasoline_car:  'Benzinli Araç',
  diesel_car:    'Dizel Araç',
  waste_general: 'Genel Atık',
  shopping:      'Alışveriş',
  food:          'Gıda',
  water:         'Su',
};

// source label (DB'deki değer) → category key eşlemesi
const SOURCE_TO_CATEGORY = {
  'Elektrik':                    'energy',
  'Su Kullanımı':                'water',
  'Doğalgaz':                    'gas',
  'Benzinli Araç':               'transport',
  'Dizel Araç':                  'transport',
  'Otobüs':                      'transport',
  'Kağıt':                       'materials',
  'Plastik / Ambalaj (Harcama)': 'materials',
  'Genel Atık':                  'waste',
  'Gıda Harcaması':              'food',
  // shopping — yeni ve eski kayıtlar
  'Genel Alışveriş':             'shopping',
  'Genel Perakende / Alışveriş': 'shopping',
  'Ofis Malzemeleri':            'shopping',
  'Elektronik':                  'shopping',
  'shopping':                    'shopping',
  'other':                       'shopping',
  'Diğer':                       'shopping',
};

/** Kayıttan category key türet */
function getCategoryKey(record) {
  if (record.category && CATEGORY_LABELS[record.category]) return record.category;

  const src = record.source || '';

  if (SOURCE_TO_CATEGORY[src]) return SOURCE_TO_CATEGORY[src];

  // Kayıt zaten kategori key ise (energy, gas, ...)
  if (CATEGORY_LABELS[src]) return src;

  // Kelime bazlı fallback
  const lower = src.toLowerCase();
  if (lower.includes('uçuş') || lower.includes('flight') || lower.includes('araç') || lower.includes('otobüs') || lower.includes('bus')) return 'transport';
  if (lower.includes('elektrik') || lower.includes('electricity'))    return 'energy';
  if (lower.includes('su') || lower.includes('water'))                return 'water';
  if (lower.includes('doğalgaz') || lower.includes('gaz') || lower.includes('gas')) return 'gas';
  if (lower.includes('atık') || lower.includes('waste'))              return 'waste';
  if (lower.includes('gıda') || lower.includes('food'))               return 'food';
  if (lower.includes('kağıt') || lower.includes('paper') || lower.includes('plastik') || lower.includes('malzeme')) return 'materials';
  if (lower.includes('alışveriş') || lower.includes('shop') || lower.includes('retail')) return 'shopping';

  return 'shopping';
}

/** Faaliyet Türü görüntü değerini döndür */
function getActivityTypeLabel(record) {
  if (record.activity_type) {
    return ACTIVITY_TYPE_LABELS[record.activity_type] || record.activity_type;
  }
  // source zaten Türkçe etiket; doğrudan göster
  return record.source || '—';
}

// --- Durum (State) ---
let allEmissions = [];
let pendingDeleteId = null;

// --- DOM ---
const tbody            = document.getElementById('emissionsTableBody');
const searchInput      = document.getElementById('searchInput');
const categoryFilter   = document.getElementById('categoryFilter');
const totalShown       = document.getElementById('totalShown');
const totalCO2         = document.getElementById('totalCO2');
const deleteModal      = document.getElementById('deleteModal');
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
  const selectedCategory = categoryFilter.value;
  const searchText       = searchInput.value.trim().toLowerCase();

  const filtered = allEmissions.filter(record => {
    const catKey   = getCategoryKey(record);
    const actLabel = getActivityTypeLabel(record);

    const matchesCategory = !selectedCategory || catKey === selectedCategory;

    const searchableText = [
      catKey,
      CATEGORY_LABELS[catKey] || '',
      record.activity_type || '',
      ACTIVITY_TYPE_LABELS[record.activity_type] || '',
      record.source || '',
      actLabel,
      String(record.date || ''),
      String(parseFloat(record.amount || 0).toFixed(1)),
    ].join(' ').toLowerCase();

    const matchesSearch = !searchText || searchableText.includes(searchText);

    return matchesCategory && matchesSearch;
  });

  if (totalShown) totalShown.textContent = filtered.length;
  if (totalCO2)   totalCO2.textContent   = filtered.reduce((s, r) => s + parseFloat(r.amount || 0), 0).toFixed(1);

  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Kriterlerinize uygun bir kayıt bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(record => {
    const catKey   = getCategoryKey(record);
    const catLabel = CATEGORY_LABELS[catKey] || catKey || '—';
    const actLabel = getActivityTypeLabel(record);

    return `
    <tr>
      <td>${formatDate(record.date)}</td>
      <td>${catLabel}</td>
      <td>${actLabel}</td>
      <td style="color:var(--color-text-muted);font-size:13px;">—</td>
      <td><strong>${parseFloat(record.amount || 0).toFixed(1)}</strong></td>
      <td>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <a href="add-emission.html?id=${record.id}" class="btn-action btn-edit" title="Düzenle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
            Düzenle
          </a>
          <button class="btn-action btn-delete" data-id="${record.id}" title="Sil">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            Sil
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingDeleteId = btn.dataset.id;
      if (deleteModal) deleteModal.style.display = 'flex';
    });
  });
}

// --- Olay Dinleyiciler ---
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
      await loadData();
    } catch (err) {
      alert('Kayıt silinemedi: ' + err.message);
    }
  }
  if (deleteModal) deleteModal.style.display = 'none';
  pendingDeleteId = null;
});

loadData();
