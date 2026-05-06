import { renderLayout } from './layout.js';
import { showToast }    from './utils/uiUtils.js';
import { ApiClient }    from './api/apiClient.js';
import { updateGlobe } from './utils/globe.js';
import { emissionService } from './api/emissionService.js';

const user = renderLayout({ activeNav: 'nav-whatif', title: 'Gelecek Ay Planlayıcısı' });
if (!user) throw new Error('redirect');

const api = new ApiClient();

// ── DOM Referansları ──────────────────────────────────────────────────────────
const actionsContainer  = document.getElementById('actionsContainer'); // Sürgüleri bu konteynırda render edeceğiz
const currentTotalVal   = document.getElementById('currentTotalVal');
const projectedTotalVal = document.getElementById('projectedTotalVal');
const savingsVal        = document.getElementById('savingsVal');
const impactBadge       = document.getElementById('impactBadge');
const resetBtn          = document.getElementById('resetBtn');
const globeSimLabel     = document.getElementById('globeSimLabel');

// ── Kategoriler ve Konfigürasyonlar (Katsayı & Finansal Maliyetler) ────────────
const CATEGORIES_CONFIG = {
  'energy': {
    name: 'Enerji (Elektrik)',
    icon: '⚡',
    unit: 'kWh',
    factor: 0.45,       // 1 kWh ~ 0.45 kg CO2
    defaultCo2: 85.0
  },
  'water': {
    name: 'Su',
    icon: '💧',
    unit: 'm³',
    factor: 0.3,        // 1 m³ ~ 0.3 kg CO2
    defaultCo2: 12.0
  },
  'gas': {
    name: 'Doğalgaz',
    icon: '🔥',
    unit: 'm³',
    factor: 1.9,        // 1 m³ ~ 1.9 kg CO2
    defaultCo2: 70.0
  },
  'transport': {
    name: 'Ulaşım',
    icon: '🚗',
    unit: 'km',
    factor: 0.18,       // 1 km ~ 0.18 kg CO2
    defaultCo2: 140.0
  },
  'materials': {
    name: 'Malzeme',
    icon: '📦',
    unit: 'kg',
    factor: 0.5,        // 1 kg ~ 0.5 kg CO2
    defaultCo2: 45.0
  },
  'waste': {
    name: 'Atık',
    icon: '🗑️',
    unit: 'kg',
    factor: 0.8,        // 1 kg ~ 0.8 kg CO2
    defaultCo2: 25.0
  },
  'food': {
    name: 'Gıda',
    icon: '🍽️',
    unit: 'Gün',
    factor: 3.5,        // 1 gün etli/karışık beslenme ~ 3.5 kg CO2
    defaultCo2: 110.0
  },
  'shopping': {
    name: 'Alışveriş',
    icon: '🛍️',
    unit: 'TL',
    factor: 0.05,       // 1 TL ~ 0.05 kg CO2
    defaultCo2: 60.0
  }
};

// ── Durum (State) ─────────────────────────────────────────────────────────────
let baselines = {}; // { energy: { qty: 188, co2: 85 }, ... }
let changes = {};   // { energy: 0, ... } (percentage -100 to 100)

// ── Başlatma ──────────────────────────────────────────────────────────────────
(async () => {
  // Role özel Hedef Belirleme kartı güncellemesi
  const goalTitleEl = document.getElementById('targetGoalTitle');
  const goalTextEl  = document.getElementById('targetGoalText');
  if (goalTitleEl && goalTextEl) {
    if (user.role === 'company') {
      goalTitleEl.textContent = 'ESG ve Karbon Hedefleri';
      goalTextEl.innerHTML = 'Kurumsal emisyon hedefleri, uluslararası net-sıfır karbon mevzuatlarına (AB CBAM vb.) uyum için kritik öneme sahiptir. Ofis enerjisi ve şirket araç filosunda verimlilik sağlayarak karbon maliyetlerinizi düşürün.';
    } else if (user.role === 'household') {
      goalTitleEl.textContent = 'Hanehalkı Hedef Belirleme';
      goalTextEl.innerHTML = 'Türkiye ortalama hanehalkı karbon ayak izi aylık yaklaşık <strong>1.125 kg CO₂e</strong>\'dir. Aile içi işbirliği ile enerji ve ısıtma tasarrufu sağlayarak bu değerin altında kalmayı hedefleyin.';
    } else {
      goalTitleEl.textContent = 'Hedef Belirleme';
      goalTextEl.innerHTML = 'Türkiye bireysel ortalaması aylık <strong>450 kg CO₂e</strong>\'dir. Yeşil bir dünya için hedefiniz bu değerin altında kalmak olmalı. Özellikle ulaşım ve enerji alanındaki küçük değişimler büyük farklar yaratır.';
    }
  }

  try {
    const { records } = await api.get('/emissions');
    if (!records || records.length === 0) {
      renderEmptyState();
    } else {
      processRecords(records);
      renderSliders();
      updateProjection();
    }
  } catch (e) {
    console.error('[planner] init error:', e);
    showToast('Hata', 'Veriler yüklenirken bir hata oluştu', 'error');
  }
})();

// ── Boş Durum Tasarımı (Veri Olmadığında Çalışır) ──────────────────────────────
function renderEmptyState() {
  actionsContainer.innerHTML = `
    <div class="glass-card" style="padding: 36px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; margin: 0; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; background: rgba(255,255,255,0.01);">
      <span style="font-size: 40px;">📊</span>
      <h3 style="margin: 0; font-size: 18px; color: var(--color-brand-text); font-weight: 700;">Henüz Veri Girişi Yapılmadı</h3>
      <p style="margin: 0; font-size: 13px; color: var(--color-text-muted); line-height: 1.6;">
        Gelecek Ay Planlayıcısı'nı kullanabilmek için lütfen öncelikle en az 1 emisyon kaydı ekleyin. Eklediğiniz veriler üzerinden gerçekçi gelecek simülasyonları yapabilirsiniz.
      </p>
      <a href="add-entry.html" class="btn-primary" style="display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; border-radius: 12px; font-weight: 600; text-decoration: none; width: 100%; margin-top: 8px;">
        İlk Emisyon Kaydını Ekle
      </a>
    </div>
  `;
  
  currentTotalVal.textContent = "0.0";
  projectedTotalVal.textContent = "0.0";
  
  const comparisonText = document.getElementById('comparisonText');
  if (comparisonText) {
    comparisonText.innerHTML = 'Planlayıcıyı etkinleştirmek için lütfen emisyon kaydı ekleyin.';
  }
  
  if (impactBadge) impactBadge.style.display = 'none';
  if (resetBtn) resetBtn.style.display = 'none';

  // Sürgü ayarları sıfırlansın
  Object.keys(CATEGORIES_CONFIG).forEach(cat => {
    baselines[cat] = { qty: 0, co2: 0 };
    changes[cat] = 0;
  });

  // Globe'ları yeşil/stabil (0 emisyon) olarak sıfır yükle
  updateGlobe(0, {
    containerId: 'globeCurrentContainer',
    labelId:     'none',
    textId:      'none'
  });

  updateGlobe(0, {
    containerId: 'globeSimContainer',
    labelId:     'globeSimLabel',
    textId:      'none'
  });
}

// ── Veri İşleme (Mevcut Ortalamaları Al) ────────────────────────────────────────
function processRecords(records) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const baselineCo2 = {};
  
  records.forEach(r => {
    const amount = parseFloat(r.amount) || 0;
    const source = (r.source || 'other').toLowerCase();
    
    let cat = 'other';
    if (source.includes('elektrik') || source.includes('electricity') || source.includes('energy')) cat = 'energy';
    else if (source.includes('gaz') || source.includes('gas')) cat = 'gas';
    else if (source.includes('su') || source.includes('water')) cat = 'water';
    else if (source.includes('ulaşım') || source.includes('transport') || source.includes('car') || source.includes('bus')) cat = 'transport';
    else if (source.includes('alışveriş') || source.includes('shopping')) cat = 'shopping';
    else if (source.includes('gıda') || source.includes('food')) cat = 'food';
    else if (source.includes('malzeme') || source.includes('material')) cat = 'materials';
    else if (source.includes('atık') || source.includes('waste')) cat = 'waste';

    if (cat !== 'other') {
      if (!baselineCo2[cat]) baselineCo2[cat] = 0;
      if (r.date.startsWith(thisMonth)) {
          baselineCo2[cat] += amount;
      }
    }
  });

  // Eğer bu ay hiç veri yoksa, tüm zamanların ortalamasını al
  if (Object.keys(baselineCo2).length === 0 || Object.values(baselineCo2).every(v => v === 0)) {
     records.forEach(r => {
        const amount = parseFloat(r.amount) || 0;
        const source = (r.source || 'other').toLowerCase();
        let cat = 'other';
        if (source.includes('elektrik') || source.includes('electricity') || source.includes('energy')) cat = 'energy';
        else if (source.includes('gaz') || source.includes('gas')) cat = 'gas';
        else if (source.includes('su') || source.includes('water')) cat = 'water';
        else if (source.includes('ulaşım') || source.includes('transport') || source.includes('car') || source.includes('bus')) cat = 'transport';
        else if (source.includes('alışveriş') || source.includes('shopping')) cat = 'shopping';
        else if (source.includes('gıda') || source.includes('food')) cat = 'food';
        else if (source.includes('malzeme') || source.includes('material')) cat = 'materials';
        else if (source.includes('atık') || source.includes('waste')) cat = 'waste';

        if (cat !== 'other') {
          if (!baselineCo2[cat]) baselineCo2[cat] = 0;
          baselineCo2[cat] += amount;
        }
     });
     
     const months = new Set(records.map(r => r.date.slice(0, 7))).size || 1;
     Object.keys(baselineCo2).forEach(k => baselineCo2[k] /= months);
  }

  // State Oluştur (Role özel emisyon ölçeklendirmesi ekledik: Bireysel 1x, Hane 2.5x, Şirket 12x)
  const roleScale = user.role === 'company' ? 12.0 : user.role === 'household' ? 2.5 : 1.0;

  Object.keys(CATEGORIES_CONFIG).forEach(cat => {
    const config = CATEGORIES_CONFIG[cat];
    const co2 = (baselineCo2[cat] && baselineCo2[cat] > 0) ? baselineCo2[cat] : (config.defaultCo2 * roleScale);
    const qty = co2 / config.factor;
    
    baselines[cat] = { qty, co2 };
    changes[cat] = 0; // Başlangıçta değişim %0
  });
}

// ── Sürgüleri Oluştur (Render Sliders) ─────────────────────────────────────────
function renderSliders() {
  actionsContainer.innerHTML = '';
  
  Object.keys(CATEGORIES_CONFIG).forEach(cat => {
    const config = CATEGORIES_CONFIG[cat];
    const baseline = baselines[cat];
    const val = changes[cat];
    
    const targetQty = baseline.qty * (1 + val / 100);
    const targetCo2 = baseline.co2 * (1 + val / 100);

    const item = document.createElement('div');
    item.className = 'cat-slider-item';
    item.style.marginBottom = '22px';
    
    item.innerHTML = `
      <div class="cat-label-row" style="margin-bottom: 6px">
        <span class="cat-name">${config.name}</span>
        <span class="cat-qty-display" id="qty-${cat}" style="font-weight: 700; color: var(--color-primary)">
          ${Math.round(targetQty)} ${config.unit} (${targetCo2.toFixed(1)} kg)
        </span>
      </div>
      <input type="range" class="custom-range" id="range-${cat}" 
             min="-100" max="100" step="5" value="${val}">
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--color-text-muted); margin-top:-4px">
        <span id="badge-${cat}" style="font-weight: 600; color: ${val < 0 ? '#10b981' : (val > 0 ? '#f59e0b' : 'inherit')}">
          ${val > 0 ? '+' : ''}${val}%
        </span>
        <span>Mevcut: ${Math.round(baseline.qty)} ${config.unit} (${baseline.co2.toFixed(1)} kg)</span>
      </div>
    `;

    const slider = item.querySelector('input');
    slider.addEventListener('input', (e) => {
      changes[cat] = parseInt(e.target.value);
      updateProjection();
    });

    actionsContainer.appendChild(item);
  });
}

// ── Toplam Hesaplama ve Güncelleme ─────────────────────────────────────────────
function updateProjection() {
  let currentTotal = 0;
  let projectedTotal = 0;

  Object.keys(CATEGORIES_CONFIG).forEach(cat => {
    const config = CATEGORIES_CONFIG[cat];
    const baseline = baselines[cat];
    const changePct = changes[cat];
    
    const targetQty = baseline.qty * (1 + changePct / 100);
    const targetCo2 = baseline.co2 * (1 + changePct / 100);

    currentTotal += baseline.co2;
    projectedTotal += targetCo2;

    // Sürgü değerini ve miktar yazısını anlık güncelle
    const badge = document.getElementById(`badge-${cat}`);
    const qtyDisplay = document.getElementById(`qty-${cat}`);
    
    if (badge) {
      badge.textContent = `${changePct > 0 ? '+' : ''}${changePct}%`;
      badge.style.color = changePct < 0 ? '#10b981' : (changePct > 0 ? '#f59e0b' : 'inherit');
    }
    
    if (qtyDisplay) {
      qtyDisplay.textContent = `${Math.round(targetQty)} ${config.unit} (${targetCo2.toFixed(1)} kg)`;
    }
  });

  currentTotalVal.textContent = currentTotal.toFixed(1);
  projectedTotalVal.textContent = projectedTotal.toFixed(1);

  const diff = projectedTotal - currentTotal;

  if (diff < -0.1) {
    impactBadge.style.display = 'flex';
    savingsVal.textContent = `${Math.abs(diff).toFixed(1)} kg`;
    savingsVal.style.color = '#10b981';
  } else if (diff > 0.1) {
    impactBadge.style.display = 'flex';
    savingsVal.textContent = `+${diff.toFixed(1)} kg`;
    savingsVal.style.color = '#f59e0b';
  } else {
    impactBadge.style.display = 'none';
  }

  // Globe'ları güncelle
  updateGlobe(currentTotal, {
    containerId: 'globeCurrentContainer',
    labelId:     'none',
    textId:      'none'
  });

  updateGlobe(projectedTotal, {
    containerId: 'globeSimContainer',
    labelId:     'globeSimLabel',
    textId:      'none'
  });

  // Karşılaştırma metni
  const comparisonText = document.getElementById('comparisonText');
  
  if (diff < -5) {
     const pctSaved = Math.round((Math.abs(diff) / currentTotal) * 100);
     comparisonText.innerHTML = `Müthiş! Gelecek ay emisyonlarınızı <strong style="color:#10b981">%${pctSaved} (${Math.abs(diff).toFixed(1)} kg)</strong> oranında azaltmayı planlıyorsunuz.`;
  } else if (diff > 5) {
     const pctIncrease = Math.round((diff / currentTotal) * 100);
     comparisonText.innerHTML = `Dikkat! Bu planla emisyonlarınız <strong style="color:#f59e0b">%${pctIncrease} (+${diff.toFixed(1)} kg)</strong> artacak gibi görünüyor.`;
  } else {
     comparisonText.innerHTML = `Mevcut alışkanlıklarınızı koruyarak stabil bir gelecek planlıyorsunuz.`;
  }
}

// ── Sıfırlama (Reset) ──────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  Object.keys(CATEGORIES_CONFIG).forEach(cat => {
    changes[cat] = 0;
    const input = document.getElementById(`range-${cat}`);
    if (input) input.value = 0;
  });
  
  renderSliders();
  updateProjection();
});

// ── Yapay Zeka Azaltım Yol Haritası ──────────────────────────────────────────
const getAiRoadmapBtn = document.getElementById('getAiRoadmapBtn');
const aiPlannerContent = document.getElementById('aiPlannerContent');
const aiPlannerSteps = document.getElementById('aiPlannerSteps');

if (getAiRoadmapBtn && aiPlannerContent && aiPlannerSteps) {
  getAiRoadmapBtn.addEventListener('click', async () => {
    try {
      getAiRoadmapBtn.disabled = true;
      getAiRoadmapBtn.innerHTML = '<span>Yol Haritası Hazırlanıyor...</span>';
      
      aiPlannerContent.style.display = 'block';
      aiPlannerSteps.innerHTML = '<li style="list-style: none; margin-left: -20px; text-align: center; color: var(--color-text-muted);">Yapay zekanız verilerinizi analiz ediyor...</li>';

      const roadmap = await emissionService.getSimulationRoadmap(changes);
      
      aiPlannerSteps.innerHTML = '';
      if (roadmap.steps && roadmap.steps.length > 0) {
        roadmap.steps.forEach(step => {
          // Eğer adım yapısal olarak kategori ve adımlar dizisi içeriyorsa, şık bir grup halinde render et
          if (step && typeof step === 'object' && step.kategori && Array.isArray(step.adimlar)) {
            const catLi = document.createElement('li');
            catLi.style.listStyle = 'none';
            catLi.style.marginLeft = '-20px';
            catLi.style.marginTop = '14px';
            catLi.style.marginBottom = '6px';
            catLi.style.fontWeight = '700';
            catLi.style.color = '#3b82f6';
            catLi.textContent = step.kategori;
            aiPlannerSteps.appendChild(catLi);

            step.adimlar.forEach(subStep => {
              const subLi = document.createElement('li');
              subLi.textContent = subStep;
              subLi.style.marginBottom = '6px';
              subLi.style.marginLeft = '10px';
              subLi.style.listStyleType = 'circle';
              aiPlannerSteps.appendChild(subLi);
            });
          } else {
            const li = document.createElement('li');
            if (step && typeof step === 'object') {
              li.textContent = step.text || step.step || step.instruction || JSON.stringify(step);
            } else {
              li.textContent = step;
            }
            li.style.marginBottom = '8px';
            aiPlannerSteps.appendChild(li);
          }
        });
      } else {
        aiPlannerSteps.innerHTML = '<li style="list-style: none; margin-left: -20px;">Sürgüleri sola kaydırarak hedefler belirleyin ve tekrar deneyin.</li>';
      }
    } catch (err) {
      console.error('[planner.roadmap]', err);
      aiPlannerSteps.innerHTML = '<li style="list-style: none; margin-left: -20px; color: var(--color-error);">Yol haritası oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.</li>';
    } finally {
      getAiRoadmapBtn.disabled = false;
      getAiRoadmapBtn.innerHTML = '<span>Yol Haritası Üret</span>';
    }
  });
}
