import { emissionService }  from './api/emissionService.js';
import { profileService }   from './api/profileService.js';
import { renderLayout }     from './layout.js';
import { calculateStats, showToast } from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-profile', title: 'Hesap Merkezi' });
if (!user) throw new Error('redirect');

// ── Human-readable label maps ─────────────────────────────────────────────────

const FIELD_LABELS = {
  home_type:               'Konut tipi',
  household_size:          'Hane halkı büyüklüğü',
  is_household_head:       'Hane reisi',
  company_name:            'Şirket adı',
  industry:                'Sektör',
  employee_count_range:    'Çalışan sayısı',
  department_count_range:  'Departman sayısı',
  monthly_kwh:             'Aylık elektrik tüketimi',
  heating_type:            'Isınma kaynağı',
  has_ac:                  'Klima kullanımı',
  renewable_energy:        'Yenilenebilir enerji',
  water_saving_devices:    'Su tasarrufu cihazları',
  office_energy_source:    'Ofis enerji kaynağı',
  office_electricity_level:'Ofis elektrik tüketimi',
  remote_work_policy:      'Çalışma politikası',
  has_car:                 'Araç sahipliği',
  car_fuel_type:           'Araç yakıt tipi',
  weekly_km:               'Haftalık sürüş mesafesi',
  carpooling:              'Araç paylaşımı',
  has_company_vehicles:    'Şirket araçları',
  fleet_fuel:              'Filo yakıt tipi',
  fleet_size:              'Filo büyüklüğü',
  public_transport_freq:   'Toplu taşıma sıklığı',
  public_transport_type:   'Toplu taşıma türü',
  cycles_or_walks:         'Yürüme / bisiklet kullanımı',
  taxi_freq:               'Taksi / uygulama kullanımı',
  domestic_flights:        'Yıllık yurt içi uçuş',
  international_flights:   'Yıllık yurt dışı uçuş',
  typical_flight_distance: 'Tipik uçuş mesafesi',
  has_business_travel:     'İş seyahati (hava yolu)',
  diet_type:               'Beslenme tarzı',
  red_meat_freq:           'Kırmızı et tüketimi',
  dairy_level:             'Süt ürünleri tüketimi',
  local_food_pref:         'Yerel / mevsimsel ürün tercihi',
  food_waste:              'Gıda israfı düzeyi',
  online_shopping_freq:    'Online alışveriş sıklığı',
  new_vs_secondhand:       'Yeni - İkinci el tercihi',
  fast_fashion:            'Hızlı moda',
  recycling_categories:    'Geri dönüşüm yapılan malzemeler',
  composting:              'Kompost',
  waste_bags_week:         'Haftalık çöp torbası sayısı',
  single_use_plastic:      'Tek kullanımlık plastik',
  motivation:              'Ana motivasyon',
  priority_area:           'Öncelikli alan',
};

const VALUE_LABELS = {
  apartment: 'Apartman Dairesi', house: 'Müstakil Ev', detached: 'Villa / Köşk',
  shared: 'Paylaşımlı / Kiralık', dormitory: 'Öğrenci Yurdu',
  natural_gas: 'Doğalgaz', electricity: 'Elektrik', coal: 'Kömür / Katı Yakıt',
  wood: 'Odun / Biyokütle', heat_pump: 'Isı Pompası', district: 'Merkezi Isıtma',
  solar: 'Güneş Panelleri', green_plan: 'Yeşil Enerji Tarifesi', both: 'Her İkisi',
  none: 'Yok / Hayır', petrol: 'Benzin', diesel: 'Dizel', lpg: 'LPG',
  hybrid: 'Hibrit', electric: 'Elektrikli',
  '<50': '< 50 km/hafta', '50-150': '50–150 km/hafta', '150-300': '150–300 km/hafta',
  '300-500': '300–500 km/hafta', '>500': '> 500 km/hafta',
  '<100': '< 100 kWh/ay', '100-200': '100–200 kWh/ay', '200-400': '200–400 kWh/ay',
  '400-600': '400–600 kWh/ay', '>600': '> 600 kWh/ay',
  unknown: 'Bilmiyorum', daily: 'Günlük', few_week: 'Haftada birkaç kez',
  weekly: 'Haftalık', monthly: 'Aylık', rarely: 'Nadiren', never: 'Hiçbir zaman',
  bus: 'Otobüs', metro: 'Metro / Metrobüs', train: 'Tren / Raylı Sistem',
  ferry: 'Vapur', mixed: 'Karma',
  '0': 'Hiç', '1-2': '1–2', '3-5': '3–5', '6-10': '6–10', '10+': '10+',
  short: 'Kısa Mesafe (< 3 sa)', medium: 'Orta Mesafe (3–7 sa)', long: 'Uzun Mesafe (7 sa+)',
  vegan: 'Vegan', vegetarian: 'Vejetaryen', pescatarian: 'Pesketaryen', meat_heavy: 'Et ağırlıklı',
  high: 'Yüksek', low: 'Düşük', a_lot: 'Çok fazla', some: 'Biraz',
  little: 'Çok az', minimal: 'Neredeyse hiç',
  always: 'Her zaman', often: 'Sık sık', sometimes: 'Bazen',
  always_new: 'Her zaman yeni', mostly_new: 'Çoğunlukla yeni', mostly_used: 'Çoğunlukla ikinci el',
  yes: 'Evet, düzenli olarak', paper: 'Kağıt', plastic: 'Plastik', glass: 'Cam',
  metal: 'Metal', ewaste: 'E-atık',
  save_money: 'Para tasarrufu', reduce_carbon: 'Karbon ayak izimi azaltmak',
  company_reporting: 'Şirket raporlaması / uyumluluk', environmental: 'Çevresel farkındalık',
  academic: 'Akademik / proje kullanımı', transport: 'Ulaşım', energy: 'Ev enerjisi',
  flights: 'Uçuş ve seyahat', food: 'Gıda ve beslenme', shopping: 'Alışveriş',
  waste: 'Atık ve geri dönüşüm', supply_chain: 'Tedarik zinciri',
  'true': 'Evet', 'false': 'Hayır',
  grid: 'Şebeke Elektriği', renewable: 'Yenilenebilir / Yeşil Enerji',
  on_site: 'Tamamen Ofisten', fully_remote: 'Tamamen Uzaktan',
  manufacturing: 'Üretim', technology: 'Teknoloji', retail: 'Perakende',
  healthcare: 'Sağlık', finance: 'Finans', education: 'Eğitim',
  construction: 'İnşaat', other: 'Diğer',
  '1-10': '1–10', '11-50': '11–50', '51-200': '51–200', '201-1000': '201–1.000',
  '1000+': '1.000+', '1-3': '1–3', '4-10': '4–10', '11-25': '11–25', '25+': '25+',
  '1-5': '1–5', '6-20': '6–20', '21-50': '21–50', '50+': '50+',
};

const FIELD_VALUE_LABELS = {
  diet_type: { mixed: 'Karma / Her şeyi yiyen' },
  fleet_fuel: { petrol: 'Ağırlıklı Benzin', diesel: 'Ağırlıklı Dizel', electric: 'Elektrikli Filo', mixed: 'Karma' },
  office_electricity_level: {
    low: 'Düşük (< 1.000 kWh/ay)', medium: 'Orta (1.000–5.000 kWh/ay)',
    high: 'Yüksek (5.000–20.000 kWh/ay)', very_high: 'Çok Yüksek (20.000+ kWh/ay)',
  },
  remote_work_policy: { on_site: 'Tamamen Ofisten', hybrid: 'Hibrit', fully_remote: 'Tamamen Uzaktan' },
};

function formatValue(key, raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return raw.map(v => FIELD_VALUE_LABELS[key]?.[v] ?? VALUE_LABELS[v] ?? v).join(', ');
  }
  const strVal = String(raw);
  return FIELD_VALUE_LABELS[key]?.[strVal] ?? VALUE_LABELS[strVal] ?? strVal;
}

const PROFILE_SECTIONS = [
  { id: 'household_details', title: 'Konut Bilgileri', icon: '🏠', roles: ['individual', 'household'], fields: ['home_type', 'household_size', 'is_household_head'] },
  { id: 'company_details',   title: 'Şirket Bilgileri', icon: '🏭', roles: ['company'],                fields: ['company_name', 'industry', 'employee_count_range', 'department_count_range'] },
  { id: 'energy',            title: 'Ev & Enerji', icon: '⚡', roles: ['individual', 'household'],     fields: ['monthly_kwh', 'heating_type', 'has_ac', 'renewable_energy', 'water_saving_devices'] },
  { id: 'office_energy',     title: 'Ofis & Enerji', icon: '🏢', roles: ['company'],                   fields: ['office_energy_source', 'office_electricity_level', 'remote_work_policy'] },
  { id: 'transport',         title: 'Ulaşım', icon: '🚗', roles: 'all',                               fields: ['has_car', 'car_fuel_type', 'weekly_km', 'carpooling', 'has_company_vehicles', 'fleet_fuel', 'fleet_size', 'public_transport_freq', 'public_transport_type', 'cycles_or_walks', 'taxi_freq'] },
  { id: 'flights',           title: 'Uçuş & Seyahat', icon: '✈️', roles: 'all',                       fields: ['domestic_flights', 'international_flights', 'typical_flight_distance', 'has_business_travel'] },
  { id: 'food',              title: 'Gıda & Beslenme', icon: '🍽', roles: ['individual', 'household'], fields: ['diet_type', 'red_meat_freq', 'dairy_level', 'local_food_pref', 'food_waste'] },
  { id: 'shopping',          title: 'Alışveriş & Atık', icon: '🛍', roles: ['individual', 'household'],fields: ['online_shopping_freq', 'new_vs_secondhand', 'fast_fashion', 'recycling_categories', 'composting', 'waste_bags_week', 'single_use_plastic'] },
  { id: 'goals',             title: 'Hedefler & Motivasyon', icon: '🎯', roles: 'all',                 fields: ['motivation', 'priority_area'] },
];

function renderFieldRow(key, raw) {
  const label   = FIELD_LABELS[key] ?? key.replace(/_/g, ' ');
  const display = formatValue(key, raw);
  const row = document.createElement('div');
  row.className = 'profile-field-row';
  row.innerHTML = `
    <span class="profile-field-label">${label}</span>
    <span class="profile-field-value${display ? '' : ' not-provided'}">${display ?? 'Belirtilmemiş'}</span>`;
  return row;
}

function renderSection(section, answers) {
  const populated = section.fields.filter(key => {
    const v = answers?.[key];
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  });

  const card = document.createElement('div');
  card.className = 'content-card';

  const header = document.createElement('div');
  header.className = 'profile-section-header';
  header.innerHTML = `
    <span class="profile-section-icon">${section.icon}</span>
    <span class="profile-section-title">${section.title}</span>
    ${populated.length === 0 ? '<span class="profile-section-badge incomplete">Doldurulmadı</span>' : ''}`;
  card.appendChild(header);

  if (populated.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-section-empty';
    empty.textContent = 'Bu bölüm için yanıt girilmemiş.';
    card.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'profile-field-list';
    populated.forEach(key => list.appendChild(renderFieldRow(key, answers[key])));
    card.appendChild(list);
  }
  return card;
}

// ── System preferences (localStorage) ────────────────────────────────────────

const PREFS_KEY = 'emission_user_prefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}

function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function applyPrefsToUI(prefs) {
  document.querySelectorAll('.pref-checkbox').forEach(cb => {
    const key = cb.dataset.pref;
    cb.checked = prefs[key] !== false; // default true
  });
  const langSel = document.getElementById('prefLanguage');
  if (langSel) langSel.value = prefs.language || 'tr';
  const unitSel = document.getElementById('prefUnit');
  if (unitSel) unitSel.value = prefs.unit || 'kg_co2e';
}

function collectPrefsFromUI() {
  const prefs = {};
  document.querySelectorAll('.pref-checkbox').forEach(cb => {
    prefs[cb.dataset.pref] = cb.checked;
  });
  const lang = document.getElementById('prefLanguage');
  if (lang) prefs.language = lang.value;
  const unit = document.getElementById('prefUnit');
  if (unit) prefs.unit = unit.value;
  return prefs;
}

function setMsg(id, text, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

// ── Main load ─────────────────────────────────────────────────────────────────

async function loadProfile() {
  try {
    const { user: u, answers } = await profileService.getProfile();

    const displayName = u.name || u.email || '?';
    const initial     = displayName.charAt(0).toUpperCase();

    document.getElementById('profileAvatar').textContent   = initial;
    document.getElementById('userInitials')?.textContent   && (document.getElementById('userInitials').textContent = initial);
    document.getElementById('profileName').textContent     = u.name || '—';
    document.getElementById('profileEmail').textContent    = u.email || '—';
    document.getElementById('editEmailDisplay') && (document.getElementById('editEmailDisplay').value = u.email || '');
    document.getElementById('editName') && (document.getElementById('editName').value = u.name || '');
    document.getElementById('profileRole').textContent     = u.role || '—';

    const since = new Date(u.created_at).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' });
    document.getElementById('profileSince').textContent = `Üyelik başlangıcı: ${since}`;

    const badge = document.getElementById('obStatusBadge');
    if (badge) {
      if (u.onboarding_completed) {
        badge.textContent = '✓ Karbon profili tamamlandı';
        badge.className = 'profile-ob-badge complete';
      } else {
        badge.textContent = '○ Karbon profili tamamlanmadı';
        badge.className = 'profile-ob-badge incomplete';
      }
    }

    // Carbon profile sections
    const container = document.getElementById('carbonProfileContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!answers) {
      container.innerHTML = `
        <div style="text-align:center; padding:32px; color:var(--color-text-muted);">
          <p style="margin-bottom:16px;">Karbon profili henüz doldurulmadı.</p>
          <a href="onboarding.html" class="btn-primary">Karbon profilini tamamla →</a>
        </div>`;
      return;
    }

    PROFILE_SECTIONS
      .filter(s => s.roles === 'all' || s.roles.includes(u.role))
      .forEach(s => container.appendChild(renderSection(s, answers)));

  } catch (err) {
    console.error('[profile] load error:', err.message);
    showToast('Hata', 'Profil verileri yüklenemedi.', 'error');
  }
}

async function loadStats() {
  try {
    const { records } = await emissionService.getAll();
    const stats = calculateStats(records);
    document.getElementById('profileStatTotal').textContent   = stats.total;
    document.getElementById('profileStatMonth').textContent   = stats.month;
    document.getElementById('profileStatEntries').textContent = stats.entries;
  } catch { /* non-critical */ }
}

// ── Name form ─────────────────────────────────────────────────────────────────

document.getElementById('editNameForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('editName');
  const name      = nameInput?.value.trim();

  if (!name || name.length < 2) {
    setMsg('editNameMsg', 'Ad en az 2 karakter olmalıdır.', true);
    return;
  }

  try {
    const btn = document.getElementById('saveNameBtn');
    if (btn) btn.disabled = true;
    const { user: updated } = await profileService.updateProfile({ name });
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    stored.name = updated.name;
    localStorage.setItem('user', JSON.stringify(stored));
    document.getElementById('profileName').textContent  = updated.name || '—';
    document.getElementById('profileAvatar').textContent = updated.name?.charAt(0).toUpperCase() || '?';
    document.getElementById('userName') && (document.getElementById('userName').textContent = updated.name || '—');
    document.getElementById('userInitials') && (document.getElementById('userInitials').textContent = updated.name?.charAt(0).toUpperCase() || '?');
    setMsg('editNameMsg', 'İsim güncellendi.', false);
  } catch (err) {
    setMsg('editNameMsg', err.message || 'Güncelleme başarısız.', true);
  } finally {
    const btn = document.getElementById('saveNameBtn');
    if (btn) btn.disabled = false;
  }
});

// ── Password change form ───────────────────────────────────────────────────────

document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPw  = document.getElementById('currentPassword')?.value;
  const newPw      = document.getElementById('newPassword')?.value;
  const confirmPw  = document.getElementById('confirmNewPassword')?.value;

  const clearErrors = () => {
    ['currentPasswordError', 'newPasswordError', 'confirmNewPasswordError'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '';
    });
  };
  clearErrors();

  let hasError = false;
  if (!currentPw) {
    document.getElementById('currentPasswordError').textContent = 'Mevcut parola gereklidir.';
    hasError = true;
  }
  if (!newPw || newPw.length < 8) {
    document.getElementById('newPasswordError').textContent = 'Yeni parola en az 8 karakter olmalıdır.';
    hasError = true;
  }
  if (newPw !== confirmPw) {
    document.getElementById('confirmNewPasswordError').textContent = 'Parolalar eşleşmiyor.';
    hasError = true;
  }
  if (hasError) return;

  try {
    const btn = document.getElementById('changePasswordBtn');
    if (btn) btn.disabled = true;
    await profileService.requestPasswordChange({ currentPassword: currentPw, newPassword: newPw });
    setMsg('changePasswordMsg', 'Parola değiştirildi.', false);
    document.getElementById('changePasswordForm').reset();
  } catch (err) {
    setMsg('changePasswordMsg', err.message || 'Parola değiştirilemedi.', true);
  } finally {
    const btn = document.getElementById('changePasswordBtn');
    if (btn) btn.disabled = false;
  }
});

// ── System preferences ────────────────────────────────────────────────────────

applyPrefsToUI(loadPrefs());

document.getElementById('savePrefsBtn')?.addEventListener('click', async () => {
  const prefs = collectPrefsFromUI();
  savePrefs(prefs);

  try {
    await profileService.updateSettings(prefs);
  } catch { /* backend yoksa localStorage'e kaydettik zaten */ }

  setMsg('prefsMsg', 'Tercihler kaydedildi.', false);
  setTimeout(() => setMsg('prefsMsg', '', false), 3000);
});

// ── Anchor scroll on load ─────────────────────────────────────────────────────

if (window.location.hash) {
  const target = document.querySelector(window.location.hash);
  if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadProfile();
loadStats();
