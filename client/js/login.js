import {
  validateEmail,
  validatePassword,
  showError,
  bindFieldValidation,
} from './utils/validation.js';
import { AuthApi } from './api/authApi.js';

const authService   = new AuthApi();

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
  window.location.href = 'forgot-password.html';
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
    const response = await authService.login(emailInput.value.trim(), passwordInput.value, rememberMeInput.checked);
    setApiMessage('Giriş başarılı! Yönlendiriliyorsunuz…', false);
    setTimeout(() => {
      sessionStorage.removeItem('post_auth_redirect');
      const needsOnboarding = response?.user?.onboarding_completed === false;
      window.location.href = needsOnboarding ? 'onboarding.html' : 'dashboard.html';
    }, 1000);
  } catch (err) {
    if (err.emailNotVerified) {
      sessionStorage.setItem('pending_email', emailInput.value.trim());
      setApiMessage('E-posta doğrulanmamış. Doğrulama sayfasına yönlendiriliyorsunuz…', true);
      setTimeout(() => { window.location.href = 'verify-email.html'; }, 1500);
      return;
    }
    setApiMessage(err.message || 'Giriş başarısız. Lütfen tekrar deneyin.', true);
    submitBtn.disabled = false;
  }
});
