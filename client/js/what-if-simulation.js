import { renderLayout }    from './layout.js';
import { showToast }       from './utils/uiUtils.js';
import { updateGlobe }     from './utils/globe.js';
import { emissionApi }     from './api/emissionApi.js';
import { householdApi }    from './api/householdApi.js';
import { companyApi }      from './api/companyApi.js';
import { getCategoryLabel } from './utils/labelUtils.js';

const user = renderLayout({ activeNav: 'nav-whatif' });
if (!user) throw new Error('redirect');

// ── Role-based task button detection ─────────────────────────────────────────
let isHouseholdAdmin = false;
let _householdMembersCache = null;
const isCompanyUser = user.role === 'company';

if (user.role === 'household') {
    householdApi.getMe().then(res => {
        isHouseholdAdmin = res.data?.household?.role === 'admin';
    }).catch(() => {});
}

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
    name: 'Enerji',
    unit: 'kWh',
    factor: 0.45,       // 1 kWh ~ 0.45 kg CO2
    defaultCo2: 85.0,
    unitPriceTL: 3.50,  // TL per kWh (Türkiye bireysel ortalama 2024)
  },
  'water': {
    name: 'Su',
    unit: 'm³',
    factor: 0.3,        // 1 m³ ~ 0.3 kg CO2
    defaultCo2: 12.0,
    unitPriceTL: 15.00, // TL per m³
  },
  'gas': {
    name: 'Doğalgaz',
    unit: 'm³',
    factor: 1.9,        // 1 m³ ~ 1.9 kg CO2
    defaultCo2: 70.0,
    unitPriceTL: 25.00, // TL per m³ (doğalgaz bireysel tarife)
  },
  'transport': {
    name: 'Ulaşım',
    unit: 'km',
    factor: 0.18,       // 1 km ~ 0.18 kg CO2
    defaultCo2: 140.0,
    unitPriceTL: 10.00, // TL per km (yakıt + amortisman tahmini)
  },
  'materials': {
    name: 'Malzeme',
    unit: 'kg',
    factor: 0.5,
    defaultCo2: 45.0,
    unitPriceTL: 30.00,
  },
  'waste': {
    name: 'Atık',
    unit: 'kg',
    factor: 0.8,
    defaultCo2: 25.0,
    unitPriceTL: 2.50,
  },
  'food': {
    name: 'Gıda',
    unit: 'Gün',
    factor: 3.5,        // 1 gün etli/karışık beslenme ~ 3.5 kg CO2
    defaultCo2: 110.0,
    unitPriceTL: 200.00, // TL per günlük beslenme harcaması
  },
  'shopping': {
    name: 'Alışveriş',
    unit: 'TL',
    factor: 0.05,       // 1 TL ~ 0.05 kg CO2
    defaultCo2: 60.0,
    unitPriceTL: 1.00,  // 1:1 (zaten TL cinsinden)
  },
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
    const { records } = await emissionApi.getAll();
    if (!records || records.length === 0) {
      renderEmptyState();
    } else {
      processRecords(records);
      renderSliders();
      updateProjection();
    }
  } catch (e) {
    console.error('[planner] init error:', e);
    showToast('Hata', 'Veriler yüklenirken bir hata oluştu.', 'error');
  }
})();

// ── Boş Durum Tasarımı (Veri Olmadığında Çalışır) ──────────────────────────────
function renderEmptyState() {
  actionsContainer.innerHTML = `
    <div class="glass-card" style="padding: 36px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; margin: 0; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-surface);">
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
  
  if (currentTotalVal) currentTotalVal.textContent = "0.0";
  if (projectedTotalVal) projectedTotalVal.textContent = "0.0";
  
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
const KNOWN_CATS = new Set(['energy','water','gas','transport','food','shopping','waste','materials']);

function _catFromRecord(r) {
  // 1) canonical category field
  const c = r.category?.toLowerCase().trim();
  if (c && KNOWN_CATS.has(c)) return c;
  // 2) source text fallback
  const source = (r.source || '').toLowerCase();
  if (source.includes('elektrik') || source.includes('electricity') || source.includes('energy')) return 'energy';
  if (source.includes('doğalgaz') || source.includes('gaz') || source.includes('gas')) return 'gas';
  if (source.includes('su') || source.includes('water')) return 'water';
  if (source.includes('ulaşım') || source.includes('transport') || source.includes('car') || source.includes('bus')) return 'transport';
  if (source.includes('alışveriş') || source.includes('shopping')) return 'shopping';
  if (source.includes('gıda') || source.includes('food')) return 'food';
  if (source.includes('malzeme') || source.includes('material') || source.includes('plastik') || source.includes('kağıt')) return 'materials';
  if (source.includes('atık') || source.includes('waste')) return 'waste';
  return 'other';
}

function processRecords(records) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const baselineCo2 = {};
  
  // Önce bu ayın verilerini topla
  records.forEach(r => {
    const amount = parseFloat(r.amount) || 0;
    const cat = _catFromRecord(r);
    if (cat !== 'other') {
      if (!baselineCo2[cat]) baselineCo2[cat] = 0;
      if (r.date.startsWith(thisMonth)) baselineCo2[cat] += amount;
    }
  });

  // Eğer BU AY HİÇ VERİ YOKSA, geçen ayların etkisinin azalarak gittiği ağırlıklı ortalamayı hesapla (Fallback)
  if (Object.keys(baselineCo2).length === 0 || Object.values(baselineCo2).every(v => v === 0)) {
    const monthlyTotals = {};
    records.forEach(r => {
      const amount = parseFloat(r.amount) || 0;
      const cat = _catFromRecord(r);
      if (cat === 'other') return;

      const monthStr = r.date.slice(0, 7);
      if (!monthlyTotals[monthStr]) monthlyTotals[monthStr] = {};
      if (!monthlyTotals[monthStr][cat]) monthlyTotals[monthStr][cat] = 0;
      monthlyTotals[monthStr][cat] += amount;
    });

    const sortedMonths = Object.keys(monthlyTotals).sort().reverse();

    if (sortedMonths.length > 0) {
      const DECAY_FACTOR = 0.7; // Geçmiş ayların etkisini geriye doğru %30 azaltır
      let totalWeight = 0;
      const categoryWeightedSums = {};
      
      Object.keys(CATEGORIES_CONFIG).forEach(cat => {
        categoryWeightedSums[cat] = 0;
        baselineCo2[cat] = 0;
      });

      sortedMonths.forEach((monthStr, index) => {
        const weight = Math.pow(DECAY_FACTOR, index);
        totalWeight += weight;

        Object.keys(CATEGORIES_CONFIG).forEach(cat => {
          const val = monthlyTotals[monthStr][cat] || 0;
          categoryWeightedSums[cat] += val * weight;
        });
      });

      Object.keys(CATEGORIES_CONFIG).forEach(cat => {
        baselineCo2[cat] = categoryWeightedSums[cat] / totalWeight;
      });
    }
  }

  // State Oluştur
  Object.keys(CATEGORIES_CONFIG).forEach(cat => {
    const config = CATEGORIES_CONFIG[cat];
    const co2 = (baselineCo2[cat] && baselineCo2[cat] > 0) ? baselineCo2[cat] : 0;
    const qty = (co2 > 0) ? co2 / config.factor : 0;
    
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
    
    const roleScale = user.role === 'company' ? 12.0 : user.role === 'household' ? 2.5 : 1.0;
    let targetQty = 0;
    let targetCo2 = 0;
    
    if (baseline.co2 === 0) {
      if (val > 0) {
        targetCo2 = (val / 100) * config.defaultCo2 * roleScale;
        targetQty = targetCo2 / config.factor;
      }
    } else {
      targetQty = baseline.qty * (1 + val / 100);
      targetCo2 = baseline.co2 * (1 + val / 100);
    }

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
        <span id="badge-${cat}" style="font-weight: 600; color: ${val < 0 ? '#5BAD8E' : (val > 0 ? '#D4A017' : 'inherit')}">
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

const _fmtTL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

// ── Toplam Hesaplama ve Güncelleme ─────────────────────────────────────────────
function updateProjection() {
  let currentTotal = 0;
  let projectedTotal = 0;
  let monthlySavingsTL = 0;
  let monthlyCostTL = 0;

  Object.keys(CATEGORIES_CONFIG).forEach(cat => {
    const config = CATEGORIES_CONFIG[cat];
    const baseline = baselines[cat];
    const changePct = changes[cat];

    const roleScale = user.role === 'company' ? 12.0 : user.role === 'household' ? 2.5 : 1.0;
    let targetQty = 0;
    let targetCo2 = 0;
    
    if (baseline.co2 === 0) {
      if (changePct > 0) {
        targetCo2 = (changePct / 100) * config.defaultCo2 * roleScale;
        targetQty = targetCo2 / config.factor;
      }
    } else {
      targetQty = baseline.qty * (1 + changePct / 100);
      targetCo2 = baseline.co2 * (1 + changePct / 100);
    }

    currentTotal += baseline.co2;
    projectedTotal += targetCo2;

    if (changePct < 0) {
      const savedQty = baseline.qty - targetQty;
      monthlySavingsTL += savedQty * config.unitPriceTL;
    } else if (changePct > 0) {
      const extraQty = targetQty - baseline.qty;
      monthlyCostTL += extraQty * config.unitPriceTL;
    }

    const badge = document.getElementById(`badge-${cat}`);
    const qtyDisplay = document.getElementById(`qty-${cat}`);

    if (badge) {
      badge.textContent = `${changePct > 0 ? '+' : ''}${changePct}%`;
      badge.style.color = changePct < 0 ? '#5BAD8E' : (changePct > 0 ? '#D4A017' : 'inherit');
    }

    if (qtyDisplay) {
      qtyDisplay.textContent = `${Math.round(targetQty)} ${config.unit} (${targetCo2.toFixed(1)} kg)`;
    }
  });

  if (currentTotalVal) currentTotalVal.textContent = currentTotal.toFixed(1);
  if (projectedTotalVal) projectedTotalVal.textContent = projectedTotal.toFixed(1);

  const diff = projectedTotal - currentTotal;
  const savingsCo2El = document.getElementById('savingsCo2');
  const annualSavingsEl = document.getElementById('annualSavingsVal');
  const impactTitleEl = document.getElementById('impactTitle');

  if (diff < -0.1) {
    impactBadge.style.display = 'flex';
    if (impactTitleEl) impactTitleEl.textContent = 'Aylık Tahmini Tasarruf';
    if (monthlySavingsTL > 0) {
      savingsVal.textContent = _fmtTL.format(Math.round(monthlySavingsTL));
      if (savingsCo2El) savingsCo2El.textContent = `${Math.abs(diff).toFixed(1)} kg CO₂e azalım`;
      if (annualSavingsEl) annualSavingsEl.textContent = `Yılık: ${_fmtTL.format(Math.round(monthlySavingsTL * 12))}`;
    } else {
      savingsVal.textContent = `${Math.abs(diff).toFixed(1)} kg CO₂e`;
      if (savingsCo2El) savingsCo2El.textContent = '';
      if (annualSavingsEl) annualSavingsEl.textContent = '';
    }
    savingsVal.style.color = '#5BAD8E';
  } else if (diff > 0.1) {
    impactBadge.style.display = 'flex';
    if (impactTitleEl) impactTitleEl.textContent = 'Aylık Ek Maliyet';
    if (monthlyCostTL > 0) {
      savingsVal.textContent = _fmtTL.format(Math.round(monthlyCostTL));
      if (savingsCo2El) savingsCo2El.textContent = `+${diff.toFixed(1)} kg CO₂e artış`;
      if (annualSavingsEl) annualSavingsEl.textContent = `Yılık: ${_fmtTL.format(Math.round(monthlyCostTL * 12))}`;
    } else {
      savingsVal.textContent = `+${diff.toFixed(1)} kg CO₂e`;
      if (savingsCo2El) savingsCo2El.textContent = 'Emisyon artıyor';
      if (annualSavingsEl) annualSavingsEl.textContent = '';
    }
    savingsVal.style.color = '#D4A017';
  } else {
    impactBadge.style.display = 'none';
  }

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

  const comparisonText = document.getElementById('comparisonText');
  if (!comparisonText) return;

  if (diff < -5) {
    const pctSaved = Math.round((Math.abs(diff) / currentTotal) * 100);
    const tlPart = monthlySavingsTL > 0 ? ` · ${_fmtTL.format(Math.round(monthlySavingsTL))} aylık tahmini tasarruf` : '';
    comparisonText.innerHTML = `Müthiş! Gelecek ay emisyonlarınızı <strong style="color:#5BAD8E">%${pctSaved} (${Math.abs(diff).toFixed(1)} kg)</strong> oranında azaltmayı planlıyorsunuz${tlPart}.`;
  } else if (diff > 5) {
    const pctIncrease = Math.round((diff / currentTotal) * 100);
    comparisonText.innerHTML = `Dikkat! Bu planla emisyonlarınız <strong style="color:#D4A017">%${pctIncrease} (+${diff.toFixed(1)} kg)</strong> artacak gibi görünüyor.`;
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
    // Yalnızca negatif (azaltım) değerleri ve gerçekten tüketimi olanları filtrele
    const selectedChanges = {};
    let draggedZeroBaseline = false;

    Object.entries(changes).forEach(([cat, val]) => {
      if (Number(val) < 0) {
        if (baselines[cat] && baselines[cat].co2 > 0) {
          selectedChanges[cat] = val;
        } else {
          draggedZeroBaseline = true;
        }
      }
    });

    if (Object.keys(selectedChanges).length === 0) {
      aiPlannerContent.style.display = 'block';
      if (draggedZeroBaseline) {
        aiPlannerSteps.innerHTML = '<li style="list-style:none;margin-left:-20px;color:var(--color-text-muted);">Tüketiminiz olmayan (0 kg) bir kategoriden tasarruf edemezsiniz. Yol haritası oluşturabilmek için lütfen gerçekten karbon ayak iziniz olan bir kategorinin sürgüsünü sola kaydırın.</li>';
      } else {
        aiPlannerSteps.innerHTML = '<li style="list-style:none;margin-left:-20px;color:var(--color-text-muted);">Kişisel azaltım yol haritası oluşturmak için en az bir kategori için azaltım hedefi seçin (sürgüyü sola kaydırın).</li>';
      }
      aiPlannerContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    // İzin verilen kategori adları (frontend filtresi)
    const allowedNames = Object.keys(selectedChanges).map(c => (getCategoryLabel(c) || c).toLowerCase());

    try {
      getAiRoadmapBtn.disabled = true;
      getAiRoadmapBtn.innerHTML = '<span>Yol Haritası Hazırlanıyor...</span>';

      aiPlannerContent.style.display = 'block';
      aiPlannerSteps.innerHTML = '<li style="list-style:none;margin-left:-20px;text-align:center;color:var(--color-text-muted);">Yapay zekanız verilerinizi analiz ediyor...</li>';
      aiPlannerContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      const roadmap = await emissionApi.getSimulationRoadmap(selectedChanges);

      // Seçilmemiş kategorileri frontend'de de filtrele
      const steps = (roadmap.steps || []).filter(step => {
        if (!step || typeof step !== 'object' || !step.kategori) return true;
        return allowedNames.some(name => step.kategori.toLowerCase().includes(name));
      });

      aiPlannerSteps.innerHTML = '';
      if (steps.length > 0) {
        steps.forEach(step => {
          if (step && typeof step === 'object' && step.kategori && Array.isArray(step.adimlar)) {
            const catLi = document.createElement('li');
            catLi.style.cssText = 'list-style:none;margin-left:-20px;margin-top:14px;margin-bottom:6px;font-weight:700;color:var(--color-secondary);display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
            catLi.textContent = step.kategori;

            if (isHouseholdAdmin || isCompanyUser) {
              const matchedCat = Object.keys(selectedChanges).find(key => {
                const tr = (getCategoryLabel(key) || '').toLowerCase();
                const lower = step.kategori.toLowerCase();
                return lower.includes(tr) || lower.includes(tr.split(' ')[0]);
              });
              const pctMatch = step.kategori.match(/(\d+(?:\.\d+)?)/);
              if (matchedCat && pctMatch) {
                const addBtn = document.createElement('button');
                addBtn.textContent = isCompanyUser ? '+ Şirket Görevi Ekle' : '+ Hane Görevi Ekle';
                addBtn.style.cssText = 'font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--color-primary);background:transparent;color:var(--color-primary);cursor:pointer;font-weight:600;flex-shrink:0;';
                addBtn.addEventListener('click', () => openAddTaskModal(matchedCat, parseFloat(pctMatch[1]), step.kategori));
                catLi.appendChild(addBtn);
              }
            }

            aiPlannerSteps.appendChild(catLi);

            step.adimlar.forEach(subStep => {
              const subLi = document.createElement('li');
              subLi.textContent = subStep;
              subLi.style.cssText = 'margin-bottom:6px;margin-left:10px;list-style-type:circle';
              aiPlannerSteps.appendChild(subLi);
            });
          } else {
            const li = document.createElement('li');
            li.textContent = step && typeof step === 'object'
              ? (step.text || step.step || step.instruction || JSON.stringify(step))
              : step;
            li.style.marginBottom = '8px';
            aiPlannerSteps.appendChild(li);
          }
        });
      } else {
        aiPlannerSteps.innerHTML = '<li style="list-style:none;margin-left:-20px;">Sürgüleri sola kaydırarak hedefler belirleyin ve tekrar deneyin.</li>';
      }
    } catch (err) {
      console.error('[planner.roadmap]', err);
      aiPlannerSteps.innerHTML = '<li style="list-style:none;margin-left:-20px;color:var(--color-error);">Yol haritası oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.</li>';
    } finally {
      getAiRoadmapBtn.disabled = false;
      getAiRoadmapBtn.innerHTML = '<span>Yol Haritası Üret</span>';
    }
  });
}

// ── No-records modal ──────────────────────────────────────────────────────────
const noRecordsModal     = document.getElementById('noRecordsModal');
const noRecordsVazgecBtn = document.getElementById('noRecordsVazgecBtn');

function showNoRecordsModal() {
  if (noRecordsModal) noRecordsModal.style.display = 'flex';
}
function hideNoRecordsModal() {
  if (noRecordsModal) noRecordsModal.style.display = 'none';
}
noRecordsVazgecBtn?.addEventListener('click', hideNoRecordsModal);
noRecordsModal?.addEventListener('click', e => { if (e.target === noRecordsModal) hideNoRecordsModal(); });

// ── Add as Household Task modal ───────────────────────────────────────────────
const addTaskModal       = document.getElementById('addTaskModal');
const cancelAddTaskBtn   = document.getElementById('cancelAddTaskBtn');
const confirmAddTaskBtn  = document.getElementById('confirmAddTaskBtn');
const taskModalTitle     = document.getElementById('taskModalTitle');
const taskModalPct       = document.getElementById('taskModalPct');
const taskModalCategoryKey   = document.getElementById('taskModalCategoryKey');
const taskModalCategoryLabel = document.getElementById('taskModalCategoryLabel');
const taskModalAssignee  = document.getElementById('taskModalAssignee');
const taskModalDueDate   = document.getElementById('taskModalDueDate');


async function _ensureMembers() {
  if (_householdMembersCache) return _householdMembersCache;
  try {
    const res = await householdApi.getMembers();
    _householdMembersCache = res.data?.members ?? [];
  } catch {
    _householdMembersCache = [];
  }
  return _householdMembersCache;
}

async function openAddTaskModal(categoryKey, pct, label) {
  if (!addTaskModal) return;

  const modalTitle = addTaskModal.querySelector('.modal-title');
  const modalDesc  = addTaskModal.querySelector('p');
  if (isCompanyUser) {
    if (modalTitle) modalTitle.textContent = 'Şirket Görevi Ekle';
    if (modalDesc)  modalDesc.textContent  = 'Bu AI önerisini emisyon takipli bir şirket görevine dönüştürün.';
  } else {
    if (modalTitle) modalTitle.textContent = 'Hane Görevi Ekle';
    if (modalDesc)  modalDesc.textContent  = 'Bu AI önerisini emisyon takipli bir hane görevine dönüştürün.';
  }

  taskModalCategoryKey.value     = categoryKey;
  taskModalCategoryLabel.textContent = getCategoryLabel(categoryKey);
  taskModalTitle.value           = label;
  taskModalPct.value             = Math.round(pct);

  // Default due date = last day of current month
  const now     = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  taskModalDueDate.value = lastDay.toISOString().slice(0, 10);

  // Assignee field: hide for company (single user), populate for household
  const assigneeRow = taskModalAssignee?.closest('.form-group') || taskModalAssignee?.parentElement;
  if (isCompanyUser) {
    if (assigneeRow) assigneeRow.style.display = 'none';
  } else {
    if (assigneeRow) assigneeRow.style.display = '';
    taskModalAssignee.innerHTML = '<option value="">🏠 Tüm Hane</option>';
    const members = await _ensureMembers();
    members.forEach(m => {
      const opt = document.createElement('option');
      opt.value       = m.user_id;
      opt.textContent = `👤 ${m.name || m.email}${m.role === 'admin' ? ' (Yönetici)' : ''}`;
      taskModalAssignee.appendChild(opt);
    });
  }

  addTaskModal.style.display = 'flex';
}

cancelAddTaskBtn?.addEventListener('click', () => {
  if (addTaskModal) addTaskModal.style.display = 'none';
});
addTaskModal?.addEventListener('click', e => {
  if (e.target === addTaskModal) addTaskModal.style.display = 'none';
});

confirmAddTaskBtn?.addEventListener('click', async () => {
  const title    = taskModalTitle?.value.trim();
  const pct      = parseFloat(taskModalPct?.value);
  const category = taskModalCategoryKey?.value;

  if (!title) {
    showToast('Hata', 'Görev başlığı gereklidir.', 'error');
    return;
  }
  if (!pct || pct <= 0 || pct >= 100) {
    showToast('Hata', 'Hedef azaltım 1 ile 99 arasında olmalıdır.', 'error');
    return;
  }

  confirmAddTaskBtn.disabled    = true;
  confirmAddTaskBtn.textContent = 'Oluşturuluyor…';
  try {
    if (isCompanyUser) {
      await companyApi.createTask({
        title,
        emission_category:   category,
        target_reduction_pct: pct,
        due_date:            taskModalDueDate?.value || undefined,
      });
      addTaskModal.style.display = 'none';
      showToast('Başarılı', 'Şirket görevi oluşturuldu.', 'success');
    } else {
      await householdApi.createTask({
        title,
        emission_category: category,
        target_pct:        pct,
        assigned_to:       taskModalAssignee?.value || undefined,
        due_date:          taskModalDueDate?.value  || undefined,
      });
      addTaskModal.style.display = 'none';
      showToast('Başarılı', 'Hane görevi oluşturuldu.', 'success');
    }
  } catch (err) {
    if (err.message?.includes('en az bir emisyon kaydı')) {
      if (addTaskModal) addTaskModal.style.display = 'none';
      showNoRecordsModal();
    } else {
      showToast('Hata', err.message, 'error');
    }
  } finally {
    confirmAddTaskBtn.disabled    = false;
    confirmAddTaskBtn.textContent = 'Görevi Oluştur';
  }
});
