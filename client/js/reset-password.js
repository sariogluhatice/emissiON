import {
  validateStrongPassword,
  validateConfirmPassword,
  showError,
  bindFieldValidation,
} from './utils/validation.js';
import { AuthService } from './api/authService.js';

const authService = new AuthService();

const params          = new URLSearchParams(window.location.search);
const uid             = params.get('uid');
const token           = params.get('token');

const form                  = document.getElementById('resetForm');
const passwordInput         = document.getElementById('password');
const confirmPasswordInput  = document.getElementById('confirmPassword');
const submitBtn             = document.getElementById('submitBtn');
const apiMessage            = document.getElementById('apiMessage');
const passwordError         = document.getElementById('passwordError');
const confirmPasswordError  = document.getElementById('confirmPasswordError');

// Redirect immediately if token or uid is missing from the URL.
if (!uid || !token) {
  window.location.replace('login.html');
}

bindFieldValidation(passwordInput,        passwordError,        () => validateStrongPassword(passwordInput.value));
bindFieldValidation(confirmPasswordInput, confirmPasswordError, () => validateConfirmPassword(confirmPasswordInput.value, passwordInput.value));

function setApiMessage(text, isError) {
  apiMessage.textContent = text;
  apiMessage.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const pErr = validateStrongPassword(passwordInput.value);
  const cErr = validateConfirmPassword(confirmPasswordInput.value, passwordInput.value);

  showError(passwordInput,        passwordError,        pErr);
  showError(confirmPasswordInput, confirmPasswordError, cErr);

  if (pErr || cErr) return;

  submitBtn.disabled = true;
  setApiMessage('', false);

  try {
    await authService.resetPassword(uid, token, passwordInput.value);
    setApiMessage('Şifreniz başarıyla güncellendi. Giriş sayfasına yönlendiriliyorsunuz…', false);
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 2000);
  } catch (err) {
    setApiMessage(err.message || 'Şifre sıfırlama başarısız. Lütfen yeni bağlantı talep edin.', true);
    submitBtn.disabled = false;
  }
});
