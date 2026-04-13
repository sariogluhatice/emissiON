import { TokenManager }   from './api/tokenManager.js';
import { emissionService } from './api/emissionService.js';
import {
  validateRequired,
  showError,
  bindFieldValidation,
} from './utils/validation.js';

// Guard: redirect to login if not authenticated
if (!TokenManager.exists()) {
  window.location.href = 'login.html';
}

const params    = new URLSearchParams(window.location.search);
const editId    = params.get('id');
const isEdit    = !!editId;

const formTitle = document.getElementById('formTitle');
const submitBtn = document.getElementById('submitBtn');
const apiMessage = document.getElementById('apiMessage');

const sourceInput = document.getElementById('source');
const amountInput = document.getElementById('amount');
const dateInput   = document.getElementById('date');

const sourceError = document.getElementById('sourceError');
const amountError = document.getElementById('amountError');
const dateError   = document.getElementById('dateError');

if (isEdit) {
  formTitle.textContent = 'Edit Record';
  submitBtn.textContent = 'Update Record';
}

function validateAmount(value) {
  if (!value) return 'Amount is required.';
  if (isNaN(parseFloat(value)) || parseFloat(value) <= 0) return 'Amount must be a positive number.';
  return '';
}

bindFieldValidation(sourceInput, sourceError, () => validateRequired(sourceInput.value, 'Source'));
bindFieldValidation(amountInput, amountError, () => validateAmount(amountInput.value));
bindFieldValidation(dateInput,   dateError,   () => validateRequired(dateInput.value, 'Date'));

function setApiMessage(text, isError) {
  apiMessage.textContent = text;
  apiMessage.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

// Edit mode: load existing record into form
if (isEdit) {
  (async () => {
    try {
      const { records } = await emissionService.getAll();
      const record = records.find(r => String(r.id) === editId);
      if (!record) {
        setApiMessage('Record not found.', true);
        return;
      }
      sourceInput.value = record.source;
      amountInput.value = record.amount;
      dateInput.value   = record.date.slice(0, 10); // ISO date → YYYY-MM-DD
    } catch {
      setApiMessage('Failed to load record.', true);
    }
  })();
}

document.getElementById('recordForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const sErr = validateRequired(sourceInput.value, 'Source');
  const aErr = validateAmount(amountInput.value);
  const dErr = validateRequired(dateInput.value, 'Date');

  showError(sourceInput, sourceError, sErr);
  showError(amountInput, amountError, aErr);
  showError(dateInput,   dateError,   dErr);

  if (sErr || aErr || dErr) return;

  submitBtn.disabled = true;
  setApiMessage('', false);

  const payload = {
    source: sourceInput.value.trim(),
    amount: parseFloat(amountInput.value),
    date:   dateInput.value,
  };

  try {
    if (isEdit) {
      await emissionService.update(editId, payload);
    } else {
      await emissionService.create(payload);
    }
    window.location.href = 'dashboard.html';
  } catch (err) {
    setApiMessage(err.message || 'Failed to save record.', true);
    submitBtn.disabled = false;
  }
});
