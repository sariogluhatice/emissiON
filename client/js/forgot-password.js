import {
  validateEmail,
  showError,
  bindFieldValidation,
} from './utils/validation.js';
import { AuthService } from './api/authService.js';

const authService = new AuthService();

const form       = document.getElementById('forgotForm');
const emailInput = document.getElementById('email');
const submitBtn  = document.getElementById('submitBtn');
const apiMessage = document.getElementById('apiMessage');
const emailError = document.getElementById('emailError');

bindFieldValidation(emailInput, emailError, () => validateEmail(emailInput.value));

function setApiMessage(text, isError) {
  apiMessage.textContent = text;
  apiMessage.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const eErr = validateEmail(emailInput.value);
  showError(emailInput, emailError, eErr);
  if (eErr) return;

  submitBtn.disabled = true;
  setApiMessage('', false);

  try {
    await authService.forgotPassword(emailInput.value.trim());
  } catch (_) {
    // Intentionally swallow errors — always show the generic message below
    // to prevent revealing whether the email is registered.
  }

  setApiMessage('Eğer bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderilmiştir.', false);
  submitBtn.disabled = false;
});
