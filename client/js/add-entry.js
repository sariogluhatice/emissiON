import { emissionService } from './api/emissionService.js';
import { TokenManager } from './api/tokenManager.js';
import { getCurrentUser, renderTopbarUser, bindLogout, showToast } from './utils/uiUtils.js';

const user = getCurrentUser();
if (!user) window.location.href = 'login.html';
renderTopbarUser(user);
bindLogout();

// ── Data model ────────────────────────────────────────────────────────────────
// inputType: 'quantity' → quantity required, unit shown
//            'spend'    → totalAmount TRY required, quantity hidden
//            'flight'   → origin/dest required, quantity & amount hidden
const ACTIVITY_MAP = {
    energy: [
        { id: 'electricity',    label: 'Elektrik',            units: ['kWh'],        inputType: 'quantity' },
    ],
    water: [
        { id: 'water_usage',    label: 'Su Kullanımı',         units: ['m3', 'l'],    inputType: 'quantity' },
    ],
    gas: [
        { id: 'natural_gas',    label: 'Doğalgaz',             units: ['m3', 'kWh'],  inputType: 'quantity' },
    ],
    transport: [
        { id: 'car_petrol',     label: 'Benzinli Araç',        units: ['km'],         inputType: 'quantity' },
        { id: 'car_diesel',     label: 'Dizel Araç',           units: ['km'],         inputType: 'quantity' },
        { id: 'bus',            label: 'Otobüs',               units: ['km'],         inputType: 'quantity' },
        { id: 'train',          label: 'Tren',                 units: ['km'],         inputType: 'quantity' },
        { id: 'flight_short',   label: 'Kısa Mesafe Uçuş',     units: ['km'],         inputType: 'flight'   },
        { id: 'flight_long',    label: 'Uzun Mesafe Uçuş',     units: ['km'],         inputType: 'flight'   },
    ],
    materials: [
        { id: 'plastic',        label: 'Plastik',              units: ['kg'],         inputType: 'quantity' },
        { id: 'paper',          label: 'Kağıt',                units: ['kg'],         inputType: 'quantity' },
    ],
    waste: [
        { id: 'waste_general',  label: 'Genel Atık',           units: ['kg'],         inputType: 'quantity' },
        { id: 'recycling',      label: 'Geri Dönüşüm',         units: ['kg'],         inputType: 'quantity' },
    ],
    food: [
        { id: 'food_general',   label: 'Genel Gıda',           units: ['kg'],         inputType: 'quantity' },
        { id: 'meat',           label: 'Et Tüketimi',          units: ['kg'],         inputType: 'quantity' },
    ],
    other: [
        { id: 'office_supplies',label: 'Ofis Malzemeleri',     units: ['TRY'],        inputType: 'spend'    },
        { id: 'electronics',    label: 'Elektronik',           units: ['TRY'],        inputType: 'spend'    },
        { id: 'shopping_general',label:'Genel Alışveriş',      units: ['TRY'],        inputType: 'spend'    },
    ],
};

// Maps simplified activity IDs → Climatiq activityId + API unit.
// convert: { inputUnit: fn } transforms the user's quantity to what the API expects.
// spendBased: true → quantity is a TRY→USD converted amount, API unit is 'usd'.
const CLIMATIQ_MAP = {
    electricity:     { activityId: 'electricity-supply_grid-source_supplier_mix',                                                              apiUnit: 'kWh' },
    water_usage:     { activityId: 'water_supply-type_na',                                                                                     apiUnit: 'l',   convert: { m3: v => v * 1000 } },
    natural_gas:     { activityId: 'fuel-type_gaseous_fuels_net-fuel_use_na',                                                                  apiUnit: 'kWh', convert: { m3: v => v * 10.55 } },
    car_petrol:      { activityId: 'passenger_vehicle-vehicle_type_car-fuel_source_petrol-engine_size_na-vehicle_age_na-vehicle_weight_na',    apiUnit: 'km'  },
    car_diesel:      { activityId: 'passenger_vehicle-vehicle_type_car-fuel_source_diesel-engine_size_na-vehicle_age_na-vehicle_weight_na',    apiUnit: 'km'  },
    bus:             { activityId: 'passenger_vehicle-vehicle_type_bus-fuel_source_na-engine_size_na-vehicle_age_na-vehicle_weight_na',        apiUnit: 'km'  },
    train:           { activityId: 'passenger_vehicle-vehicle_type_train-fuel_source_na-engine_size_na-vehicle_age_na-vehicle_weight_na',      apiUnit: 'km'  },
    // flight_short / flight_long → handled via { from, to } in buildPayload()
    plastic:         { activityId: 'manufactured_goods-type_plastics_products',                                                                apiUnit: 'kg'  },
    paper:           { activityId: 'paper_and_cardboard-type_paper_average_source',                                                            apiUnit: 'kg'  },
    waste_general:   { activityId: 'waste_management-type_solid_waste_disposal-disposal_method_managed_waste_disposal_sites',                  apiUnit: 'kg'  },
    recycling:       { activityId: 'waste_management-type_recycling-disposal_method_recycling_na',                                             apiUnit: 'kg'  },
    food_general:    { activityId: 'food_beverage_tobacco-type_food_beverage_tobacco_products',                                                apiUnit: 'kg'  },
    meat:            { activityId: 'food_beverage_tobacco-type_food_beverage_tobacco_products',                                                apiUnit: 'kg'  },
    office_supplies: { activityId: 'general_retail-type_nonstore_retailers',                                                                   apiUnit: 'usd', spendBased: true },
    electronics:     { activityId: 'general_retail-type_nonstore_retailers',                                                                   apiUnit: 'usd', spendBased: true },
    shopping_general:{ activityId: 'general_retail-type_nonstore_retailers',                                                                   apiUnit: 'usd', spendBased: true },
};

// Fallback TRY → USD rate used when no OCR exchange rate is available
const TRY_USD_FALLBACK = 38;

const OCR_CATEGORY_MAP = {
    electricity: 'energy',
    water:       'water',
    natural_gas: 'gas',
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const cardManual    = document.getElementById('cardManual');
const cardVisual    = document.getElementById('cardVisual');
const uploadSection = document.getElementById('uploadSection');
const uploadZone    = document.getElementById('uploadZone');
const fileInput     = document.getElementById('fileInput');
const scanStatus    = document.getElementById('scanStatus');
const categoryEl    = document.getElementById('category');
const activityEl    = document.getElementById('activityType');
const flightRow     = document.getElementById('flightRow');
const originEl      = document.getElementById('origin');
const destEl        = document.getElementById('dest');
const quantityRow   = document.getElementById('quantityRow');
const quantityEl    = document.getElementById('quantity');
const unitSelect    = document.getElementById('unitSelect');
const amountRow     = document.getElementById('amountRow');
const totalAmountEl = document.getElementById('totalAmount');
const entryDateEl   = document.getElementById('entryDate');
const descriptionEl = document.getElementById('description');
const calcStatusEl  = document.getElementById('calcStatus');
const resultBanner  = document.getElementById('resultBanner');
const resultCo2El   = document.getElementById('resultCo2');
const calcBtn       = document.getElementById('calcBtn');
const saveBtn       = document.getElementById('saveBtn');
const clearBtn      = document.getElementById('clearBtn');
const debugOutput   = document.getElementById('debugOutput');
const entryForm     = document.getElementById('entryForm');

let currentMethod = 'manual';
let calculatedCo2 = null;
let lastOcrData   = null;

// ── Date bounds ───────────────────────────────────────────────────────────────
const today   = new Date().toISOString().split('T')[0];
const minDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
entryDateEl.setAttribute('max', today);
entryDateEl.setAttribute('min', minDate);
entryDateEl.value = today;

// ── Method switching ──────────────────────────────────────────────────────────
cardManual.addEventListener('click', () => setMethod('manual'));
cardVisual.addEventListener('click', () => setMethod('visual'));

function setMethod(m) {
    currentMethod = m;
    cardManual.classList.toggle('active', m === 'manual');
    cardVisual.classList.toggle('active', m === 'visual');
    uploadSection.style.display = m === 'visual' ? 'block' : 'none';
    updateDebug();
}

// ── Category → activity dropdown ──────────────────────────────────────────────
categoryEl.addEventListener('change', onCategoryChange);

function onCategoryChange() {
    const cat = categoryEl.value;
    activityEl.innerHTML = '';

    if (!cat) {
        activityEl.innerHTML = '<option value="">Önce kategori seçin…</option>';
        setFormMode(null);
        resetCalc();
        updateDebug();
        return;
    }

    (ACTIVITY_MAP[cat] || []).forEach((a, i) => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.label;
        if (i === 0) opt.selected = true;
        activityEl.appendChild(opt);
    });

    onActivityChange();
}

// ── Activity → unit dropdown + form mode ──────────────────────────────────────
activityEl.addEventListener('change', onActivityChange);

function onActivityChange() {
    const cat   = categoryEl.value;
    const actId = activityEl.value;
    if (!cat || !actId) return;

    const act = (ACTIVITY_MAP[cat] || []).find(a => a.id === actId);
    if (!act) return;

    populateUnits(act.units);
    setFormMode(act.inputType);
    resetCalc();
    updateDebug();
}

function populateUnits(units) {
    unitSelect.innerHTML = '';
    units.forEach((u, i) => {
        const opt       = document.createElement('option');
        opt.value       = u;
        opt.textContent = u === 'm3' ? 'm³' : u === 'TRY' ? 'TRY (₺)' : u;
        if (i === 0) opt.selected = true;
        unitSelect.appendChild(opt);
    });
}

// Controls which input rows are shown and which fields are required.
function setFormMode(mode) {
    const qLabel = quantityRow.querySelector('.label');
    const aLabel = amountRow.querySelector('.label');

    switch (mode) {
        case 'quantity':
            flightRow.style.display   = 'none';
            quantityRow.style.display = 'block';
            amountRow.style.display   = 'none';
            quantityEl.required       = true;
            totalAmountEl.required    = false;
            totalAmountEl.value       = '';
            if (qLabel) qLabel.textContent = 'Miktar';
            break;

        case 'spend':
            flightRow.style.display   = 'none';
            quantityRow.style.display = 'none';
            amountRow.style.display   = 'block';
            quantityEl.required       = false;
            totalAmountEl.required    = true;
            quantityEl.value          = '';
            if (aLabel) aLabel.textContent = 'Toplam Tutar (TRY)';
            break;

        case 'flight':
            flightRow.style.display   = 'block';
            quantityRow.style.display = 'none';
            amountRow.style.display   = 'none';
            quantityEl.required       = false;
            totalAmountEl.required    = false;
            quantityEl.value          = '';
            totalAmountEl.value       = '';
            break;

        default:
            flightRow.style.display   = 'none';
            quantityRow.style.display = 'block';
            amountRow.style.display   = 'none';
            quantityEl.required       = false;
            totalAmountEl.required    = false;
    }
}

// ── File upload + OCR ─────────────────────────────────────────────────────────
fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) startScan(file);
});

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files?.[0];
    if (file) startScan(file);
});

async function startScan(file) {
    if (file.size > 10 * 1024 * 1024) {
        showToast('Dosya Çok Büyük', '10 MB\'dan küçük bir dosya seçin.', 'error');
        return;
    }

    scanStatus.textContent = `"${file.name}" taranıyor…`;
    resetCalc();

    const isPdf = file.type === 'application/pdf';

    try {
        if (isPdf) {
            // PDFs usually receipts or documents — use receipt pipeline
            await scanShoppingReceipt(file);
        } else {
            // For images: run OCR, inspect text for utility keywords and
            // either populate utility fields or fallback to shopping receipt parsing.
            await scanImageGeneric(file);
        }
    } catch (err) {
        scanStatus.textContent = `Hata: ${err.message}`;
        showToast('Tarama Hatası', err.message, 'error');
    }
}

async function scanUtilityBill(file) {
    const base64 = await fileToBase64(file);
    const data   = await emissionService.extractOcrFromImage(base64);
    console.log('[add-entry] utility OCR:', data);
    lastOcrData = { type: 'utility', ...data };

    const ext = data.extracted;
    if (ext) {
        const mappedCat = OCR_CATEGORY_MAP[ext.category] || ext.category;
        if (mappedCat && ACTIVITY_MAP[mappedCat] && !categoryEl.value) {
            categoryEl.value = mappedCat;
            onCategoryChange();
        }
        if (ext.quantity) {
            quantityEl.value = ext.quantity;
        }
        if (ext.unit) {
            for (const opt of unitSelect.options) {
                if (opt.value.toLowerCase() === ext.unit.toLowerCase()) {
                    opt.selected = true;
                    break;
                }
            }
        }
        if (ext.date) {
            entryDateEl.value = ext.date.length === 7 ? `${ext.date}-01` : ext.date;
        }
    }

    scanStatus.textContent = 'Tarama tamamlandı — alanları doğrulayın, ardından hesaplayın.';
    showToast('Tarama Tamamlandı', 'Alanlar dolduruldu.', 'success');
    updateDebug({ ocrResult: data });
}

// Generic image OCR → decide whether it's a utility bill or a shopping receipt
async function scanImageGeneric(file) {
    const base64 = await fileToBase64(file);
    const data   = await emissionService.extractOcrFromImage(base64);
    console.log('[add-entry] image OCR:', data);
    lastOcrData = { type: 'image', ...data };

    const ocrText = String(data.ocrText || '') || '';
    const detected = detectCategoryFromText(ocrText);

    if (detected) {
        // It's a utility-like document — populate fields using existing logic
        if (!categoryEl.value || categoryEl.value !== detected) {
            categoryEl.value = detected;
            onCategoryChange();
        }

        const ext = data.extracted;
        if (ext) {
            const mappedCat = OCR_CATEGORY_MAP[ext.category] || ext.category || detected;
            if (mappedCat && ACTIVITY_MAP[mappedCat]) {
                categoryEl.value = mappedCat;
                onCategoryChange();
            }
            if (ext.quantity) quantityEl.value = ext.quantity;
            if (ext.unit) {
                for (const opt of unitSelect.options) {
                    if (opt.value.toLowerCase() === ext.unit.toLowerCase()) { opt.selected = true; break; }
                }
            }
            if (ext.date) entryDateEl.value = ext.date.length === 7 ? `${ext.date}-01` : ext.date;
        }

        scanStatus.textContent = 'Tarama tamamlandı — alanları doğrulayın, ardından hesaplayın.';
        showToast('Tarama Tamamlandı', 'Alanlar dolduruldu.', 'success');
        updateDebug({ ocrResult: data, detectedCategory: detected });
        return;
    }

    // No utility keywords found — treat as shopping/receipt
    if (!categoryEl.value) {
        categoryEl.value = 'other';
        onCategoryChange();
    }
    // Delegate to receipt-specific OCR processing which may return co2e
    await scanShoppingReceipt(file);
}

function detectCategoryFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const t = text.toLowerCase();

    // Electricity / energy
    if (/(\belektrik\b|\benerji\b|\belectricity\b)/i.test(t)) return 'energy';
    // Water
    if (/\bsu\b|\bwater\b/i.test(t)) return 'water';
    // Gas / natural gas
    if (/\bdo[gğ]algaz\b|\bdogalgaz\b|\bgaz\b|\bgas\b/i.test(t)) return 'gas';

    return null;
}

async function scanShoppingReceipt(file) {
    const formData = new FormData();
    formData.append('receipt', file);

    const res  = await fetch('/api/ocr/shopping', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${TokenManager.get() || ''}` },
        body:    formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Tarama başarısız.');

    console.log('[add-entry] shopping OCR:', data);
    lastOcrData = { type: 'shopping', ...data };

    if (data.date) entryDateEl.value = data.date.length === 7 ? `${data.date}-01` : data.date;
    if (data.originalAmount) totalAmountEl.value = data.originalAmount;

    if (!categoryEl.value) {
        categoryEl.value = 'other';
        onCategoryChange();
    }

    // Shopping OCR already returns co2e — activate result immediately
    if (data.co2e && parseFloat(data.co2e) > 0) {
        calculatedCo2 = parseFloat(data.co2e);
        showResult(calculatedCo2);
        scanStatus.textContent = `Tarama tamamlandı — ${data.originalAmount} ${data.currency} → ${calculatedCo2.toFixed(3)} kg CO₂e`;
        showToast('Tarama Tamamlandı', `${calculatedCo2.toFixed(3)} kg CO₂e hesaplandı.`, 'success');
        updateDebug({ ocrResult: data, co2e: calculatedCo2 });
        return;
    }

    scanStatus.textContent = 'Tarama tamamlandı — tutarı doğrulayın, ardından hesaplayın.';
    showToast('Tarama Tamamlandı', 'Tutar dolduruldu, lütfen doğrulayın.', 'success');
    updateDebug({ ocrResult: data });
}

// ── Validation ────────────────────────────────────────────────────────────────
function currentInputType() {
    const cat   = categoryEl.value;
    const actId = activityEl.value;
    if (!cat || !actId) return null;
    return (ACTIVITY_MAP[cat] || []).find(a => a.id === actId)?.inputType ?? null;
}

function validate() {
    document.getElementById('categoryError').textContent = '';
    document.getElementById('activityError').textContent = '';
    document.getElementById('dateError').textContent     = '';
    let ok = true;

    if (!categoryEl.value) {
        document.getElementById('categoryError').textContent = 'Lütfen bir kategori seçin.';
        ok = false;
    }
    if (categoryEl.value && !activityEl.value) {
        document.getElementById('activityError').textContent = 'Lütfen faaliyet türü seçin.';
        ok = false;
    }

    const mode = currentInputType();

    if (mode === 'quantity') {
        const qty = parseFloat(quantityEl.value);
        if (!Number.isFinite(qty) || qty <= 0) {
            showToast('Eksik Alan', 'Lütfen geçerli bir miktar girin.', 'error');
            ok = false;
        }
    } else if (mode === 'spend') {
        const amt = parseFloat(totalAmountEl.value);
        if (!Number.isFinite(amt) || amt <= 0) {
            showToast('Eksik Alan', 'Lütfen geçerli bir TRY tutarı girin.', 'error');
            ok = false;
        }
    } else if (mode === 'flight') {
        if (originEl.value.trim().length < 3 || destEl.value.trim().length < 3) {
            showToast('Eksik Alan', 'Kalkış ve varış bilgilerini girin (örn. IST, LHR).', 'error');
            ok = false;
        }
    }

    if (!entryDateEl.value) {
        document.getElementById('dateError').textContent = 'Lütfen bir tarih seçin.';
        ok = false;
    }

    return ok;
}

// ── Build Climatiq payload ────────────────────────────────────────────────────
function buildPayload() {
    const cat   = categoryEl.value;
    const actId = activityEl.value;
    const mode  = currentInputType();
    const label = activityEl.options[activityEl.selectedIndex]?.textContent || actId;

    if (mode === 'flight') {
        return { from: originEl.value.trim().toUpperCase(), to: destEl.value.trim().toUpperCase() };
    }

    const climatiq = CLIMATIQ_MAP[actId];
    if (!climatiq) throw new Error(`"${label}" için Climatiq aktivite ID'si bulunamadı.`);

    if (mode === 'spend') {
        const tryAmt = parseFloat(totalAmountEl.value);
        const rate   = lastOcrData?.exchangeRate ? parseFloat(lastOcrData.exchangeRate) : TRY_USD_FALLBACK;
        return {
            activityId:    climatiq.activityId,
            quantity:      parseFloat((tryAmt / rate).toFixed(4)),
            unit:          'usd',
            activityLabel: label,
            category:      cat,
        };
    }

    // quantity mode — apply unit conversion if needed (e.g. m³ → l for water, m³ → kWh for gas)
    const rawQty  = parseFloat(quantityEl.value);
    const inUnit  = unitSelect.value;
    const apiQty  = climatiq.convert?.[inUnit] ? climatiq.convert[inUnit](rawQty) : rawQty;

    return {
        activityId:    climatiq.activityId,
        quantity:      parseFloat(apiQty.toFixed(6)),
        unit:          climatiq.apiUnit,
        activityLabel: label,
        category:      cat,
    };
}

// ── Calculate ─────────────────────────────────────────────────────────────────
calcBtn.addEventListener('click', runCalculate);

async function runCalculate() {
    if (!validate()) return;

    calcStatusEl.className   = 'calc-status loading';
    calcStatusEl.textContent = 'Karbon ayak izi hesaplanıyor…';
    calcBtn.disabled         = true;
    resultBanner.classList.remove('visible');
    saveBtn.disabled         = true;

    try {
        const payload = buildPayload();
        console.log('[add-entry] calculate payload:', payload);

        const res  = await fetch('/api/emissions/calculate', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TokenManager.get() || ''}` },
            body:    JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Hesaplama hatası (${res.status})`);

        calculatedCo2            = parseFloat(data.co2e);
        calcStatusEl.className   = 'calc-status';
        calcStatusEl.textContent = '';
        showResult(calculatedCo2);
        updateDebug({ payload, calcResult: data, co2e: calculatedCo2 });
    } catch (err) {
        calcStatusEl.className   = 'calc-status error';
        calcStatusEl.textContent = `⚠ ${err.message}`;
        showToast('Hesaplama Hatası', err.message, 'error');
        updateDebug({ error: err.message });
    } finally {
        calcBtn.disabled = false;
    }
}

function showResult(co2) {
    resultCo2El.textContent = co2.toFixed(3);
    resultBanner.classList.add('visible');
    saveBtn.disabled = false;
}

// ── Save ──────────────────────────────────────────────────────────────────────
entryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!calculatedCo2 || calculatedCo2 <= 0) {
        showToast('Hata', 'Önce karbonu hesaplayın.', 'error');
        return;
    }
    if (!entryDateEl.value) {
        document.getElementById('dateError').textContent = 'Lütfen bir tarih seçin.';
        return;
    }

    const mode  = currentInputType();
    const desc  = descriptionEl.value.trim();
    const label = activityEl.options[activityEl.selectedIndex]?.textContent || '';
    const source = mode === 'flight'
        ? `Uçuş: ${originEl.value.trim().toUpperCase()}-${destEl.value.trim().toUpperCase()}`
        : desc || label || categoryEl.value || 'Diğer';

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Kaydediliyor…';

    try {
        await emissionService.create({ source, amount: calculatedCo2, date: entryDateEl.value });
        showToast('Kaydedildi!', 'Emisyon kaydı oluşturuldu.', 'success');
        setTimeout(() => { window.location.href = 'emissions.html'; }, 1200);
    } catch (err) {
        showToast('Kayıt Hatası', err.message || 'Kayıt yapılamadı.', 'error');
        saveBtn.disabled    = false;
        saveBtn.textContent = '✔ Onayla ve Kaydet';
    }
});

// ── Clear ─────────────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
    categoryEl.value     = '';
    activityEl.innerHTML = '<option value="">Önce kategori seçin…</option>';
    originEl.value       = '';
    destEl.value         = '';
    quantityEl.value     = '';
    totalAmountEl.value  = '';
    entryDateEl.value    = today;
    descriptionEl.value  = '';
    fileInput.value      = '';
    lastOcrData          = null;
    scanStatus.textContent = '';
    setFormMode(null);
    resetCalc();
    updateDebug();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function resetCalc() {
    calculatedCo2            = null;
    resultBanner.classList.remove('visible');
    saveBtn.disabled         = true;
    calcStatusEl.className   = 'calc-status';
    calcStatusEl.textContent = '';
}

function updateDebug(extra = {}) {
    const state = {
        method:       currentMethod,
        category:     categoryEl.value    || '—',
        activityType: activityEl.value    || '—',
        inputMode:    currentInputType()  || '—',
        quantity:     quantityEl.value    ? parseFloat(quantityEl.value) : null,
        unit:         unitSelect.value,
        totalAmountTRY: totalAmountEl.value ? parseFloat(totalAmountEl.value) : null,
        co2e:         calculatedCo2,
        date:         entryDateEl.value   || '—',
        description:  descriptionEl.value || '—',
        ...extra,
    };
    debugOutput.textContent = JSON.stringify(state, null, 2);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Dosya okunamadı.'));
        reader.readAsDataURL(file);
    });
}
