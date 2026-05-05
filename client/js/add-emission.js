import { emissionService } from './api/emissionService.js';
import { TokenManager } from './api/tokenManager.js';
import { 
  getCurrentUser, 
  renderTopbarUser, 
  bindLogout, 
  showToast 
} from './utils/uiUtils.js';

// Kurulum
const user = getCurrentUser();
if (!user) {
  window.location.href = 'login.html';
}
renderTopbarUser(user);
bindLogout();

// Düzenleme Tespiti (Edit Detection)
const params = new URLSearchParams(window.location.search);
const editId = params.get('id');
const isEdit = !!editId;

// DOM Elemanları (DOM Elements)
const form         = document.getElementById('addEmissionForm');
const submitBtn    = document.getElementById('submitBtn');
const categoryEl   = document.getElementById('category');
const amountEl     = document.getElementById('amount');
const dateEl       = document.getElementById('date');
const pageTitle    = document.getElementById('pageTitle');
const pageDesc     = document.getElementById('pageDesc');

// Tarih Kısıtlaması (Date Limitation) - Gelecek ve çok eski tarihler seçilemesin
if (dateEl) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // 1 yıl öncesini sınır olarak belirle
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const minDate = oneYearAgo.toISOString().split('T')[0];

  dateEl.setAttribute('max', today);
  dateEl.setAttribute('min', minDate); // 1 yıldan daha eskiye izin verme
  
  if (!isEdit) dateEl.value = today; // Yeni kayıtlarda varsayılan bugünü seç
}

if (isEdit) {
    if (pageTitle) pageTitle.textContent = 'Emisyon Kaydını Düzenle';
    if (pageDesc)  pageDesc.textContent  = 'Mevcut aktivite kaydınızı aşağıdan güncelleyebilirsiniz.';
    if (submitBtn) submitBtn.textContent = 'Kaydı Güncelle';
}

const climatiqBox  = document.getElementById('climatiqBox');
const standardBlock = document.getElementById('standardBlock');
const flightBlock   = document.getElementById('flightBlock');

const activityEl   = document.getElementById('activity');
const quantityEl   = document.getElementById('quantity');
const unitLabel    = document.getElementById('unitLabel');
const calcStatus   = document.getElementById('calcStatus');

// Flight specific inputs
const originEl     = document.getElementById('origin');
const destEl       = document.getElementById('destination');

// AI Elements
const aiInsightBox  = document.getElementById('aiInsightBox');
const aiInsightText = document.getElementById('aiInsightText');

// Climatiq Aktivite Eşleşmeleri
const ACTIVITY_MAP = {
  energy: [
    { id: 'electricity-supply_grid-source_supplier_mix', label: 'Elektrik', unit: 'kWh' },
  ],
  water: [
    { id: 'water_supply-type_na', label: 'Su Kullanımı', unit: 'l' },
  ],
  gas: [
    { id: 'fuel-type_gaseous_fuels_net-fuel_use_na', label: 'Doğalgaz', unit: 'kWh' },
  ],
  transport: [
    { id: 'passenger_vehicle-vehicle_type_car-fuel_source_petrol-engine_size_na-vehicle_age_na-vehicle_weight_na', label: 'Benzinli Araç', unit: 'km' },
    { id: 'passenger_vehicle-vehicle_type_car-fuel_source_diesel-engine_size_na-vehicle_age_na-vehicle_weight_na', label: 'Dizel Araç', unit: 'km' },
    { id: 'passenger_vehicle-vehicle_type_bus-fuel_source_na-engine_size_na-vehicle_age_na-vehicle_weight_na', label: 'Otobüs', unit: 'km' },
    { id: '__flight__', label: 'Uçuş (Rota)', unit: 'rota', flight: true },
  ],
  materials: [
    { id: 'paper_and_cardboard-type_paper_average_source', label: 'Kağıt', unit: 'kg' },
    { id: 'general_retail-type_nonstore_retailers', label: 'Plastik / Ambalaj (Harcama)', unit: 'usd' },
  ],
  waste: [
    { id: 'waste_management-type_solid_waste_disposal-disposal_method_managed_waste_disposal_sites', label: 'Genel Atık', unit: 'kg' },
  ],
  food: [
    { id: 'general_retail-type_nonstore_retailers', label: 'Gıda Harcaması', unit: 'usd' },
  ],
  shopping: [
    { id: 'shopping_general', label: 'Genel Alışveriş', unit: 'usd' },
  ],
};

categoryEl.addEventListener('change', () => {
  const cat = categoryEl.value;
  
  // Reset
  amountEl.value = '';
  amountEl.classList.remove('calculated');
  calcStatus.className = 'calc-status';
  calcStatus.textContent = '';

  // Reset AI box
  if (aiInsightBox) aiInsightBox.style.display = 'none';
  if (aiInsightText) aiInsightText.textContent = '';

  if (ACTIVITY_MAP[cat]) {
    climatiqBox.style.display = 'block';
    standardBlock.style.display = 'block';
    flightBlock.style.display = 'none';

    const activities = ACTIVITY_MAP[cat];
    activityEl.innerHTML = '<option value="">Bir aktivite seçin…</option>';
    activities.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = acc.label;
      opt.dataset.unit = acc.unit;
      activityEl.appendChild(opt);
    });

    const activityGroup = document.getElementById('activityTypeGroup');

    if (activities.length === 1) {
      // Sadece tek seçenek varsa dropdown'u gizle ve otomatik seç
      if (activityGroup) activityGroup.style.display = 'none';
      activityEl.selectedIndex = 1;
      unitLabel.textContent = activities[0].unit;
      activityEl.dispatchEvent(new Event('change'));
    } else if (activities.length > 1) {
      // Birden fazla seçenek varsa dropdown'u göster
      if (activityGroup) activityGroup.style.display = 'flex'; // form-group display:flex
      activityEl.selectedIndex = 0;
      unitLabel.textContent = 'birim';
    }
  } else {
    climatiqBox.style.display = 'none';
  }
});

// Aktivite Değişimi -> Birimi güncelle, uçuş bloğunu toggle et, hesapla
activityEl.addEventListener('change', () => {
  const selected = activityEl.options[activityEl.selectedIndex];
  const isFlightActivity = selected?.value === '__flight__';

  if (isFlightActivity) {
    standardBlock.style.display = 'none';
    flightBlock.style.display = 'block';
  } else {
    standardBlock.style.display = 'block';
    flightBlock.style.display = 'none';
    if (selected?.dataset.unit) unitLabel.textContent = selected.dataset.unit;
  }
  triggerCalculation();
});

// Otomatik Hesaplama Tetikleyici
const triggerCalculation = async () => {
  const cat = categoryEl.value;
  let payload = {};

  try {
    const isFlightActivity = activityEl.value === '__flight__';
    if (isFlightActivity) {
      const from = originEl.value.trim().toUpperCase();
      const to = destEl.value.trim().toUpperCase();
      if (from.length < 3 || to.length < 3) {
        calcStatus.className = 'calc-status';
        calcStatus.textContent = 'Rota bekleniyor (örn. IST -> LHR)...';
        return;
      }
      payload = { from, to };
    } else {
      const activityId = activityEl.value;
      const quantity   = parseFloat(quantityEl.value);
      const unit       = unitLabel.textContent;
      const label      = activityEl.options[activityEl.selectedIndex]?.textContent || '';
      
      if (!activityId || isNaN(quantity) || quantity <= 0) {
        amountEl.value = '';
        amountEl.classList.remove('calculated');
        if (aiInsightBox) aiInsightBox.style.display = 'none';
        return;
      }
      payload = { activityId, quantity, unit, activityLabel: label, category: cat };
    }

    calcStatus.className = 'calc-status loading';
    calcStatus.textContent = 'Karbon ayak izi hesaplanıyor...';
    amountEl.classList.remove('calculated');

    // 1. Hızlı Hesaplama (Backend /api/emissions/calculate)
    const response = await fetch('/api/emissions/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TokenManager.get() || ''}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
        console.error('Server error response:', result);
        throw new Error(result.message || `Server Error (${response.status})`);
    }

    // Ana miktar sonucunu hemen göster
    amountEl.value = result.co2e.toFixed(2);
    amountEl.classList.add('calculated');
    calcStatus.className = 'calc-status';
    calcStatus.textContent = '';

    // 2. AI İçgörüsü Hazırlığı (Lazy Loading)
    if (aiInsightBox && aiInsightText) {
      aiInsightBox.style.display = 'block';
      aiInsightBox.classList.add('loading');
      aiInsightText.innerHTML = '<div class="insight-main" style="opacity:0.6;">AI Diijital İkiziniz verileri analiz ediyor...</div>';

      try {
        // AI için gerekli etiketi belirle
        const from = originEl.value.trim().toUpperCase();
        const to = destEl.value.trim().toUpperCase();
        const displayLabel = (activityEl.value === '__flight__')
          ? `Uçuş (${from} - ${to})`
          : (activityEl.options[activityEl.selectedIndex]?.textContent || 'Bilinmeyen Aktivite');

        const insightRes = await fetch('/api/emissions/generate-insight', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TokenManager.get() || ''}`
          },
          body: JSON.stringify({
            activityLabel: displayLabel,
            co2e: result.co2e,
            unit: result.unit,
            category: cat
          })
        });

        const insightData = await insightRes.json();
        
        aiInsightBox.classList.remove('loading');

        if (insightData.aiInsight) {
          const parts = insightData.aiInsight.split('Tip:');
          const insight = parts[0].replace('Insight:', '').trim();
          const tip = parts[1] ? parts[1].trim() : '';

          aiInsightText.innerHTML = `
            <div class="insight-main">${insight}</div>
            ${tip ? `<div class="insight-tip"><strong>💡 Öneri:</strong> ${tip}</div>` : ''}
          `;
        } else {
          aiInsightBox.style.display = 'none';
        }
      } catch (aiErr) {
        console.error('Lazy AI loading failed:', aiErr);
        aiInsightBox.style.display = 'none';
      }
    }
    
  } catch (err) {
    console.error('Calculation flow error:', err);
    calcStatus.className = 'calc-status error';
    
    // Kullanıcı dostu hata mesajı
    let friendlyMsg = `⚠ ${err.message}`;
    if (err.message.includes('No emission factors')) {
      friendlyMsg = '⚠ Seçilen aktivite henüz bu bölge için desteklenmiyor.';
    } else if (err.message.includes('Failed to fetch')) {
      friendlyMsg = '⚠ Bağlantı hatası. Lütfen internetinizi kontrol edin.';
    }
    
    calcStatus.textContent = friendlyMsg;
    amountEl.value = '';
    amountEl.classList.remove('calculated');
  }
};

/** Yazarken çok fazla API çağrısını önlemek için geciktirme (debounce) fonksiyonu */
function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
}

const debouncedCalc = debounce(triggerCalculation, 600);

// Unified Listeners
quantityEl.addEventListener('input', debouncedCalc);
originEl.addEventListener('input', debouncedCalc);
destEl.addEventListener('input', debouncedCalc);

// Doğrulama (Validation)
function validate() {
  let ok = true;
  ['category','amount','date'].forEach(id => {
    const err = document.getElementById(`${id}Error`);
    if (err) err.textContent = '';
  });

  if (!categoryEl.value) {
    document.getElementById('categoryError').textContent = 'Lütfen bir kategori seçin.';
    ok = false;
  }
  const amt = parseFloat(amountEl.value);
  if (!amountEl.value || isNaN(amt) || amt <= 0) {
    document.getElementById('amountError').textContent = 'Lütfen bir miktar girin veya hesaplatın.';
    ok = false;
  }
  if (!dateEl.value) {
    document.getElementById('dateError').textContent = 'Lütfen bir tarih seçin.';
    ok = false;
  }
  return ok;
}

// Düzenleme Modu için Ön Doldurma Mantığı
if (isEdit) {
    (async () => {
        try {
            const { records } = await emissionService.getAll();
            const record = records.find(r => String(r.id) === editId);
            
            if (record) {
                // Populate basic fields
                amountEl.value = parseFloat(record.amount).toFixed(2);
                dateEl.value = record.date.slice(0, 10);
                
                // Try to guess category from source
                const source = record.source.toLowerCase();
                let category = 'shopping';

                if (source.includes('electricity') || source.includes('elektrik')) category = 'energy';
                else if (source.includes('water') || source.includes('su kullanımı')) category = 'water';
                else if (source.includes('gas') || source.includes('doğalgaz')) category = 'gas';
                else if (source.includes('car') || source.includes('araç') || source.includes('bus') || source.includes('otobüs')) category = 'transport';
                else if (source.includes('flight') || source.includes('uçuş')) category = 'transport';
                else if (source.includes('paper') || source.includes('kağıt') || source.includes('plastic')) category = 'materials';
                else if (source.includes('waste') || source.includes('atık')) category = 'waste';
                else if (source.includes('food') || source.includes('gıda')) category = 'food';
                
                categoryEl.value = category;
                categoryEl.dispatchEvent(new Event('change'));
                
                // If it's a specific activity, try to select it
                const activities = ACTIVITY_MAP[category];
                if (activities) {
                    const match = activities.find(a => source.includes(a.label.toLowerCase()) || a.label.toLowerCase().includes(source));
                    if (match) {
                        activityEl.value = match.id;
                        activityEl.dispatchEvent(new Event('change'));
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load record for edit:', err);
            showToast('Error', 'Failed to load record details.', 'error');
        }
    })();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = isEdit ? 'Güncelleniyor...' : 'Kaydediliyor...';

  try {
    // Kayıt için açıklayıcı bir "kaynak" (source) belirle
    const fromInput = originEl.value.trim();
    const toInput   = destEl.value.trim();
    let source;

    if (activityEl.value === '__flight__' && fromInput && toInput) {
      source = `Uçuş: ${fromInput.toUpperCase()}-${toInput.toUpperCase()}`;
    } else {
      const catList = ACTIVITY_MAP[categoryEl.value];
      const item = catList?.find(i => i.id === activityEl.value);
      source = item?.label || categoryEl.value || 'Genel Alışveriş';
    }

    const payload = {
      source: source,
      amount: parseFloat(amountEl.value),
      date:   dateEl.value,
    };

    if (isEdit) {
        await emissionService.update(editId, payload);
        showToast('Güncellendi!', 'Kayıt başarıyla güncellendi.', 'success');
    } else {
        await emissionService.create(payload);
        showToast('Başarılı!', 'Emisyon kaydı başarıyla oluşturuldu.', 'success');
    }
    
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
  } catch (err) {
    showToast('Hata!', err.message || 'Kayıt kaydedilemedi.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = isEdit ? 'Kaydı Güncelle' : 'Kaydet';
  }
});
