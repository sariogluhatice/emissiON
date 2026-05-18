import { emissionService }  from './api/emissionService.js';
import { TokenManager }     from './api/tokenManager.js';
import { getCurrentUser, renderTopbarUser, bindLogout, showToast } from './utils/uiUtils.js';
import { normalizeCategory } from './utils/categoryNormalizer.js';

const user = getCurrentUser();
if (!user) {
  window.location.href = 'login.html';
}
renderTopbarUser(user);
bindLogout();

const billImageEl = document.getElementById('billImage');
const runOcrBtn = document.getElementById('runOcrBtn');
const ocrTextEl = document.getElementById('ocrText');
const ocrProgressEl = document.getElementById('ocrProgress');
const extractBtn = document.getElementById('extractBtn');
const verifyForm = document.getElementById('verifyForm');
const categoryEl = document.getElementById('category');
const activityTypeEl = document.getElementById('activityType');
const quantityEl = document.getElementById('quantity');
const unitEl = document.getElementById('unit');
const periodEl = document.getElementById('period');
const calcPreviewEl = document.getElementById('calcPreview');
const confirmCreateBtn = document.getElementById('confirmCreateBtn');

const CATEGORY_ACTIVITY = {
  energy: {
    activityId: 'electricity-supply_grid-source_supplier_mix',
    expectedUnit: 'kWh',
    sourceLabel: 'Elektrik Faturası (OCR)'
  },
  water: {
    activityId: 'water_supply-type_na',
    expectedUnit: 'l',
    sourceLabel: 'Su Faturası (OCR)'
  },
  gas: {
    activityId: 'fuel-type_gaseous_fuels_net-fuel_use_na',
    expectedUnit: 'kWh',
    sourceLabel: 'Doğalgaz Faturası (OCR)'
  }
};

// activityType strings shown in the UI / stored in source label (not Climatiq values)
const ACTIVITY_TYPE_FALLBACKS = { energy: 'electricity', water: 'water_usage', gas: 'natural_gas' };

function mapOcrCategory(raw) {
  const category = normalizeCategory(raw);
  return { category, activityType: ACTIVITY_TYPE_FALLBACKS[category] || category };
}

function normalizeQuantityForCalculation(category, quantity, unit) {
  const cleanUnit = String(unit || '').trim().toLowerCase();
  let value = Number(quantity);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Miktar pozitif bir sayı olmalıdır.');
  }

  if (category === 'water') {
    // Climatiq water factor expects liters.
    if (cleanUnit === 'm3' || cleanUnit === 'm^3') value = value * 1000;
  }

  if (category === 'gas') {
    // Approx conversion for household gas when input is m3.
    if (cleanUnit === 'm3' || cleanUnit === 'm^3') value = value * 10.55;
  }

  return value;
}

runOcrBtn.addEventListener('click', async () => {
  const file = billImageEl.files?.[0];
  if (!file) {
    showToast('Dosya Seçilmedi', 'Lütfen önce bir fatura görseli seçin.', 'error');
    return;
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    showToast('Geçersiz Dosya', 'Lütfen JPG, PNG veya WEBP görsel yükleyin.', 'error');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showToast('Dosya Çok Büyük', 'Lütfen 5 MB\'dan küçük bir görsel yükleyin.', 'error');
    return;
  }

  runOcrBtn.disabled = true;
  ocrProgressEl.textContent = 'Görsel AWS Textract\'a yükleniyor...';

  try {
    const imageBase64 = await fileToBase64(file);
    const { ocrText, extracted } = await emissionService.extractOcrFromImage(imageBase64);
    console.log('[OCR DEBUG] ocrText:', ocrText);
    console.log('[OCR DEBUG] extracted:', extracted);

    let debugPre = document.getElementById('_ocrDebugBlock');
    if (!debugPre) {
      debugPre = document.createElement('pre');
      debugPre.id = '_ocrDebugBlock';
      debugPre.style.cssText = 'background:#1e1e1e;color:#0f0;padding:12px;font-size:12px;white-space:pre-wrap;border-radius:6px;margin-top:12px;max-height:300px;overflow:auto;';
      ocrTextEl.parentElement.appendChild(debugPre);
    }
    debugPre.textContent = '[RAW OCR TEXT]\n' + (ocrText || '(empty)');

    ocrTextEl.value = ocrText || '';
    const mapped = mapOcrCategory(extracted?.category);
    categoryEl.value = mapped.category;
    activityTypeEl.value = extracted?.activity_type || mapped.activityType;
    quantityEl.value = extracted?.quantity ?? '';
    unitEl.value = extracted?.unit || '';
    periodEl.value = extracted?.date || '';

    ocrProgressEl.textContent = ocrText ? 'Textract tamamlandı. Lütfen çıkarılan alanları doğrulayın.' : 'Okunabilir metin bulunamadı.';

    if (!ocrText) {
      showToast('Metin Yok', 'Textract bu görselden yeterli metin algılayamadı.', 'error');
    } else {
      showToast('Textract Tamamlandı', 'Metin okundu ve alanlar dolduruldu. Lütfen doğrulayın.', 'success');
    }
  } catch (err) {
    console.error('[ocr-import] Textract flow failed:', err);
    ocrProgressEl.textContent = 'Textract başarısız.';
    showToast('Textract Başarısız', err.message || 'Bu görsel işlenemedi.', 'error');
  } finally {
    runOcrBtn.disabled = false;
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Seçilen dosya okunamadı.'));
    reader.readAsDataURL(file);
  });
}

extractBtn.addEventListener('click', async () => {
  const text = ocrTextEl.value.trim();
  if (text.length < 20) {
    showToast('Yetersiz Metin', 'OCR metni çıkarma için çok kısa.', 'error');
    return;
  }

  extractBtn.disabled = true;
  extractBtn.textContent = 'Çıkarılıyor...';

  try {
    const { extracted } = await emissionService.extractOcr(text);

    const mappedExtract = mapOcrCategory(extracted?.category);
    categoryEl.value = mappedExtract.category;
    activityTypeEl.value = extracted?.activity_type || mappedExtract.activityType;
    quantityEl.value = extracted?.quantity ?? '';
    unitEl.value = extracted?.unit || '';
    periodEl.value = extracted?.date || '';

    showToast('Çıkarma Tamamlandı', 'Kayıt oluşturmadan önce alanları doğrulayın.', 'success');
  } catch (err) {
    console.error('[ocr-import] Extraction failed:', err);
    showToast('Çıkarma Başarısız', err.message || 'Yapısal alanlar çıkarılamadı.', 'error');
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = 'Yapısal Veri Çıkar';
  }
});

verifyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const category = categoryEl.value;
  const activityType = activityTypeEl.value.trim();
  const quantity = Number(quantityEl.value);
  const unit = unitEl.value.trim();
  const period = periodEl.value;

  if (!category || !activityType || !unit || !period || !Number.isFinite(quantity) || quantity <= 0) {
    showToast('Geçersiz Veri', 'Lütfen tüm alanları doldurun ve doğrulayın.', 'error');
    return;
  }

  const mapping = CATEGORY_ACTIVITY[category];
  if (!mapping) {
    showToast('Desteklenmeyen Kategori', 'Seçili kategori şu an hesaplanamıyor.', 'error');
    return;
  }

  confirmCreateBtn.disabled = true;
  confirmCreateBtn.textContent = 'Oluşturuluyor...';

  try {
    const quantityForCalc = normalizeQuantityForCalculation(category, quantity, unit);

    const calcRes = await fetch('/api/emissions/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TokenManager.get() || ''}`
      },
      body: JSON.stringify({
        activityId: mapping.activityId,
        quantity: quantityForCalc,
        unit: mapping.expectedUnit,
        activityLabel: activityType,
        category
      })
    });

    const calcData = await calcRes.json();
    if (!calcRes.ok) {
      throw new Error(calcData.message || 'Emisyon hesaplama başarısız.');
    }

    const emissionAmount = Number(calcData.co2e);
    if (!Number.isFinite(emissionAmount) || emissionAmount <= 0) {
      throw new Error('Hesaplanan emisyon miktarı geçersiz.');
    }

    calcPreviewEl.textContent = `Tahmini karbon ayak izi: ${emissionAmount.toFixed(2)} kg CO2e`;

    await emissionService.create({
      source: `${mapping.sourceLabel} - ${activityType}`,
      amount: emissionAmount,
      date: `${period}-01`
    });

    showToast('Kayıt Oluşturuldu', 'OCR doğrulamalı kayıt başarıyla oluşturuldu.', 'success');
    setTimeout(() => {
      window.location.href = 'emissions.html';
    }, 1200);
  } catch (err) {
    console.error('[ocr-import] Create flow failed:', err);
    showToast('Oluşturma Başarısız', err.message || 'Kayıt oluşturulamadı.', 'error');
  } finally {
    confirmCreateBtn.disabled = false;
    confirmCreateBtn.textContent = 'Onayla ve Kaydı Oluştur';
  }
});
