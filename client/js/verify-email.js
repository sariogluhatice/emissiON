import {
  validateEmail,
  showError,
  bindFieldValidation,
} from './utils/validation.js';
import { AuthService } from './api/authService.js';

const authService = new AuthService();

const form         = document.getElementById('verifyForm');
const emailInput   = document.getElementById('email');
const codeInput    = document.getElementById('code');
const submitBtn    = document.getElementById('submitBtn');
const resendBtn    = document.getElementById('resendBtn');
const apiMessage   = document.getElementById('apiMessage');
const emailError   = document.getElementById('emailError');
const codeError    = document.getElementById('codeError');
const timerDisplay = document.getElementById('timerDisplay');

const TIMER_SECS = 120;
const STORAGE_KEY = 'verifyTimerStart';

const pendingEmail = sessionStorage.getItem('pending_email');
if (pendingEmail) emailInput.value = pendingEmail;

function setApiMessage(text, isError) {
  apiMessage.textContent = text;
  apiMessage.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

function validateCode(value) {
  if (!value.trim()) return 'Doğrulama kodu zorunludur.';
  if (!/^\d{6}$/.test(value.trim())) return 'Kod tam olarak 6 rakamdan oluşmalıdır.';
  return '';
}

bindFieldValidation(emailInput, emailError, () => validateEmail(emailInput.value));
bindFieldValidation(codeInput,  codeError,  () => validateCode(codeInput.value));

// ── Timer ───────────────────────────────────────────────────────────────────

let _interval = null;

function _onTimerExpired() {
  timerDisplay.textContent = '0s';
  codeInput.disabled  = true;
  submitBtn.disabled  = true;
  resendBtn.disabled  = false;
  setApiMessage('Kodun süresi doldu. Yeni kod göndermek için butona tıklayın.', true);
}

function _runCountdown() {
  if (_interval) clearInterval(_interval);
  codeInput.disabled = false;
  submitBtn.disabled = false;
  resendBtn.disabled = true;

  _interval = setInterval(() => {
    const start     = parseInt(sessionStorage.getItem(STORAGE_KEY) || '0', 10);
    const remaining = TIMER_SECS - Math.floor((Date.now() - start) / 1000);
    if (remaining <= 0) {
      clearInterval(_interval);
      _onTimerExpired();
    } else {
      timerDisplay.textContent = `${remaining}s`;
    }
  }, 1000);
}

function startTimer() {
  sessionStorage.setItem(STORAGE_KEY, Date.now().toString());
  timerDisplay.textContent = `${TIMER_SECS}s`;
  _runCountdown();
}

function handleAccountDeleted() {
  if (_interval) clearInterval(_interval);
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem('pending_email');
  setApiMessage('Hesabınız silindi. Lütfen tekrar kayıt olunuz.', true);
  codeInput.disabled  = true;
  submitBtn.disabled  = true;
  resendBtn.disabled  = true;
  setTimeout(() => { window.location.href = 'register.html'; }, 3000);
}

// Resume if page was refreshed mid-countdown, otherwise start fresh
{
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved) {
    const elapsed = Math.floor((Date.now() - parseInt(saved, 10)) / 1000);
    if (elapsed < TIMER_SECS) {
      timerDisplay.textContent = `${TIMER_SECS - elapsed}s`;
      _runCountdown();
    } else {
      _onTimerExpired();
    }
  } else {
    startTimer();
  }
}

// ── Verify form submit ──────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const eErr = validateEmail(emailInput.value);
  const cErr = validateCode(codeInput.value);
  showError(emailInput, emailError, eErr);
  showError(codeInput,  codeError,  cErr);
  if (eErr || cErr) return;

  submitBtn.disabled = true;
  setApiMessage('', false);

  try {
    await authService.verifyEmail(emailInput.value.trim(), codeInput.value.trim());
    if (_interval) clearInterval(_interval);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('pending_email');
    setApiMessage('E-posta başarıyla doğrulandı. Lütfen giriş yapın.', false);
    setTimeout(() => { window.location.href = 'login.html'; }, 2000);
  } catch (err) {
    if (err.accountDeleted) { handleAccountDeleted(); return; }
    setApiMessage(err.message || 'Doğrulama başarısız. Lütfen tekrar deneyin.', true);
    submitBtn.disabled = false;
  }
});

// ── Resend code ─────────────────────────────────────────────────────────────

resendBtn.addEventListener('click', async () => {
  const eErr = validateEmail(emailInput.value);
  showError(emailInput, emailError, eErr);
  if (eErr) return;

  resendBtn.disabled = true;
  setApiMessage('', false);

  try {
    await authService.resendCode(emailInput.value.trim());
    setApiMessage('E-posta adresinize yeni bir kod gönderildi.', false);
    startTimer();
  } catch (err) {
    if (err.accountDeleted) { handleAccountDeleted(); return; }
    setApiMessage(err.message || 'Kod gönderilemedi. Lütfen tekrar deneyin.', true);
    resendBtn.disabled = false;
  }
});
