/**
 * js/add-emission.js
 * 
 * Yeni emisyon kaydı ekleme ve otomatik hesaplama akışını yönetir.
 * 
 * Mimari Akış:
 * 1. Kategori -> Aktivite eşleştirmesi
 * 2. Yerel emisyon faktörleri ile hesaplama (API gelene kadar bu yöntem kullanılır)
 */

import { getCurrentUser, renderTopbarUser, bindLogout, showToast } from './utils/mockData.js';
import { EMISSION_FACTORS, calculateEmission } from './utils/emissionFactors.js';
import { emissionService } from './api/emissionService.js';

// Başlangıç Kurulumu
const user = getCurrentUser();
renderTopbarUser(user);
bindLogout();

// DOM Elemanları Referansları
const form          = document.getElementById('addEmissionForm');
const submitBtn     = document.getElementById('submitBtn');

const categoryEl    = document.getElementById('category');
const activityGroup = document.getElementById('activityGroup');
const activityEl    = document.getElementById('activitySelect');
const quantityGroup = document.getElementById('quantityGroup');
const quantityEl    = document.getElementById('quantity');
const unitLabel     = document.getElementById('unitLabel');
const calcBox       = document.getElementById('calcBox');
const calcResult    = document.getElementById('calcResult');
const calcFactor    = document.getElementById('calcFactor');
const amountEl      = document.getElementById('amount');
const descEl        = document.getElementById('description');
const dateEl        = document.getElementById('date');

// Varsayılan tarih girişi
dateEl.value = new Date().toISOString().split('T')[0];

/** Kategori değiştiğinde ilgili aktivite listesini dinamik olarak günceller */
categoryEl.addEventListener('change', () => {
  const cat = categoryEl.value;
  activityEl.innerHTML = '<option value="">Select an activity…</option>';

  if (!cat || !EMISSION_FACTORS[cat]) {
    activityGroup.style.display = 'none';
    quantityGroup.style.display = 'none';
    calcBox.style.display = 'none';
    return;
  }

  EMISSION_FACTORS[cat].forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.label;
    activityEl.appendChild(opt);
  });

  activityGroup.style.display = '';
  quantityGroup.style.display = 'none';
  calcBox.style.display = 'none';
  amountEl.value = '';
});

/** Aktivite seçildiğinde birim bilgisini günceller */
activityEl.addEventListener('change', () => {
  const factor = getSelectedFactor();
  if (!factor) { quantityGroup.style.display = 'none'; return; }
  unitLabel.textContent = factor.unit;
  quantityGroup.style.display = '';
  calcBox.style.display = 'none';
  amountEl.value = '';
});

// Debounce ile miktar yazıldıkça otomatik hesaplama tetikle
quantityEl.addEventListener('input', debounce(fetchEmissionEstimate, 600));

function getSelectedFactor() {
  const cat = categoryEl.value;
  if (!cat || !EMISSION_FACTORS[cat]) return null;
  return EMISSION_FACTORS[cat].find(f => f.id === activityEl.value) || null;
}

/** 
 * Yerel emisyon faktörleriyle CO₂ hesaplar.
 * Not: Hatice API'yi bağladığında bu kısım tekrar fetch/async yapısına döndürülebilir.
 */
function fetchEmissionEstimate() {
  const factor = getSelectedFactor();
  const qty = parseFloat(quantityEl.value);

  if (!factor || !quantityEl.value || isNaN(qty) || qty <= 0) {
    calcBox.style.display = 'none';
    amountEl.value = '';
    return;
  }

  // API bağlantısı gelene kadar doğrudan yerel hesaplama yapıyoruz
  const co2 = calculateEmission(factor.id, qty);

  calcResult.textContent = `${co2.toFixed(2)} kg CO₂e`;
  calcFactor.textContent  = `${factor.factor} kgCO₂e / ${factor.unit} (IPCC/IEA Faktörü)`;
  amountEl.value = co2.toFixed(2);
  calcBox.style.display = '';
}

/** Yazma işlemi bittikten sonra gecikmeli işlem yapmak için yardımcı fonksiyon */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Form gönderilmeden önce temel doğrulama yapar */
function validate() {
  let ok = true;
  ['category','activity','quantity','amount','description','date'].forEach(k => {
    const el = document.getElementById(`${k}Error`);
    if (el) el.textContent = '';
    document.getElementById(k === 'activity' ? 'activitySelect' : k)?.classList.remove('is-invalid');
  });

  if (!categoryEl.value) {
    document.getElementById('categoryError').textContent = 'Kategori seçiniz.';
    ok = false;
  }
  if (activityGroup.style.display !== 'none' && !activityEl.value) {
    document.getElementById('activityError').textContent = 'Aktivite seçiniz.';
    ok = false;
  }
  const amt = parseFloat(amountEl.value);
  if (!amountEl.value || isNaN(amt) || amt <= 0) {
    document.getElementById('amountError').textContent = 'Geçersiz miktar.';
    ok = false;
  }
  if (!descEl.value.trim()) {
    document.getElementById('descriptionError').textContent = 'Açıklama giriniz.';
    ok = false;
  }
  return ok;
}

/** Kaydı backend API'ye gönderir */
function saveEntry(entry) {
  return emissionService.create(entry);
}

/** Formun Gönderilmesi */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Kaydediliyor…';

  try {
    await saveEntry({
      source: categoryEl.value,
      amount: parseFloat(amountEl.value),
      date:   dateEl.value,
    });

    showToast('Başarılı!', 'Emisyon kaydı başarıyla oluşturuldu.', 'success');
    setTimeout(() => { window.location.href = './emissions.html'; }, 1500);
  } catch {
    showToast('Hata!', 'Kayıt sırasında bir problem oluştu.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Entry';
  }
});
