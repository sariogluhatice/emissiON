import { emissionService } from './api/emissionService.js';
import { TokenManager } from './api/tokenManager.js';
import { getCurrentUser, renderTopbarUser, bindLogout, showToast } from './utils/uiUtils.js';

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
  electricity: {
    activityId: 'electricity-supply_grid-source_supplier_mix',
    expectedUnit: 'kWh',
    sourceLabel: 'Electricity Bill (OCR)'
  },
  water: {
    activityId: 'water_supply-type_na',
    expectedUnit: 'l',
    sourceLabel: 'Water Bill (OCR)'
  },
  natural_gas: {
    activityId: 'fuel-type_gaseous_fuels_net-fuel_use_na',
    expectedUnit: 'kWh',
    sourceLabel: 'Natural Gas Bill (OCR)'
  }
};

function normalizeQuantityForCalculation(category, quantity, unit) {
  const cleanUnit = String(unit || '').trim().toLowerCase();
  let value = Number(quantity);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Quantity must be a positive number.');
  }

  if (category === 'water') {
    // Climatiq water factor expects liters.
    if (cleanUnit === 'm3' || cleanUnit === 'm^3') value = value * 1000;
  }

  if (category === 'natural_gas') {
    // Approx conversion for household gas when input is m3.
    if (cleanUnit === 'm3' || cleanUnit === 'm^3') value = value * 10.55;
  }

  return value;
}

runOcrBtn.addEventListener('click', async () => {
  const file = billImageEl.files?.[0];
  if (!file) {
    showToast('Missing file', 'Please select a bill image first.', 'error');
    return;
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    showToast('Invalid file', 'Please upload JPG, PNG, or WEBP image.', 'error');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showToast('File too large', 'Please upload an image smaller than 5MB.', 'error');
    return;
  }

  runOcrBtn.disabled = true;
  ocrProgressEl.textContent = 'Uploading image to AWS Textract...';

  try {
    const imageBase64 = await fileToBase64(file);
    const { ocrText, extracted } = await emissionService.extractOcrFromImage(imageBase64);

    ocrTextEl.value = ocrText || '';
    categoryEl.value = extracted?.category || '';
    activityTypeEl.value = extracted?.activity_type || '';
    quantityEl.value = extracted?.quantity ?? '';
    unitEl.value = extracted?.unit || '';
    periodEl.value = extracted?.date || '';

    ocrProgressEl.textContent = ocrText ? 'Textract completed. Please verify extracted fields.' : 'No readable text found.';

    if (!ocrText) {
      showToast('No text', 'Textract could not detect enough text from this image.', 'error');
    } else {
      showToast('Textract done', 'Text read and fields prefilled. Please verify.', 'success');
    }
  } catch (err) {
    console.error('[ocr-import] Textract flow failed:', err);
    ocrProgressEl.textContent = 'Textract failed.';
    showToast('Textract failed', err.message || 'Could not process this image.', 'error');
  } finally {
    runOcrBtn.disabled = false;
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

extractBtn.addEventListener('click', async () => {
  const text = ocrTextEl.value.trim();
  if (text.length < 20) {
    showToast('Insufficient text', 'OCR text is too short for extraction.', 'error');
    return;
  }

  extractBtn.disabled = true;
  extractBtn.textContent = 'Extracting...';

  try {
    const { extracted } = await emissionService.extractOcr(text);

    categoryEl.value = extracted?.category || '';
    activityTypeEl.value = extracted?.activity_type || '';
    quantityEl.value = extracted?.quantity ?? '';
    unitEl.value = extracted?.unit || '';
    periodEl.value = extracted?.date || '';

    showToast('Extraction done', 'Please verify fields before creating the entry.', 'success');
  } catch (err) {
    console.error('[ocr-import] Extraction failed:', err);
    showToast('Extraction failed', err.message || 'Could not extract structured fields.', 'error');
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = 'Extract Structured Data';
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
    showToast('Invalid data', 'Please complete and verify all fields.', 'error');
    return;
  }

  const mapping = CATEGORY_ACTIVITY[category];
  if (!mapping) {
    showToast('Unsupported category', 'Selected category cannot be calculated right now.', 'error');
    return;
  }

  confirmCreateBtn.disabled = true;
  confirmCreateBtn.textContent = 'Creating...';

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
      throw new Error(calcData.message || 'Emission calculation failed.');
    }

    const emissionAmount = Number(calcData.co2e);
    if (!Number.isFinite(emissionAmount) || emissionAmount <= 0) {
      throw new Error('Calculated emission amount is invalid.');
    }

    calcPreviewEl.textContent = `Estimated footprint: ${emissionAmount.toFixed(2)} kg CO2e`;

    await emissionService.create({
      source: `${mapping.sourceLabel} - ${activityType}`,
      amount: emissionAmount,
      date: `${period}-01`
    });

    showToast('Entry created', 'OCR verified entry was created successfully.', 'success');
    setTimeout(() => {
      window.location.href = 'emissions.html';
    }, 1200);
  } catch (err) {
    console.error('[ocr-import] Create flow failed:', err);
    showToast('Create failed', err.message || 'Could not create entry.', 'error');
  } finally {
    confirmCreateBtn.disabled = false;
    confirmCreateBtn.textContent = 'Confirm and Create Entry';
  }
});
