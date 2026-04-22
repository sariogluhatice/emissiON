import {
  validateEmail,
  validatePassword,
  showError,
  bindFieldValidation,
} from './utils/validation.js';
import { AuthService } from './api/authService.js';

const authService   = new AuthService();

const form               = document.getElementById('loginForm');
const emailInput         = document.getElementById('email');
const passwordInput      = document.getElementById('password');
const rememberMeInput    = document.getElementById('rememberMe');
const forgotPasswordBtn  = document.getElementById('forgotPasswordBtn');
const submitBtn          = document.getElementById('submitBtn');
const apiMessage         = document.getElementById('apiMessage');
const emailError         = document.getElementById('emailError');
const passwordError      = document.getElementById('passwordError');

bindFieldValidation(emailInput,    emailError,    () => validateEmail(emailInput.value));
bindFieldValidation(passwordInput, passwordError, () => validatePassword(passwordInput.value, 1));

forgotPasswordBtn.addEventListener('click', () => {
  const email = window.prompt('E-posta adresinizi girin, size bir sıfırlama bağlantısı gönderelim:');
  if (email === null) return; // kullanıcı iptal etti
  apiMessage.textContent = email.trim()
    ? 'Eğer bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderilmiştir.'
    : 'Lütfen geçerli bir e-posta adresi girin.';
  apiMessage.className = 'api-message is-success';
});

function setApiMessage(text, isError) {
  apiMessage.textContent = text;
  apiMessage.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const eErr = validateEmail(emailInput.value);
  const pErr = validatePassword(passwordInput.value, 1);

  showError(emailInput,    emailError,    eErr);
  showError(passwordInput, passwordError, pErr);

  if (eErr || pErr) return;

  submitBtn.disabled = true;
  setApiMessage('', false);

  try {
    await authService.login(emailInput.value.trim(), passwordInput.value, rememberMeInput.checked);
    setApiMessage('Giriş başarılı! Yönlendiriliyorsunuz…', false);
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1000);
  } catch (err) {
    setApiMessage(err.message || 'Giriş başarısız. Lütfen tekrar deneyin.', true);
    submitBtn.disabled = false;
  }
});
