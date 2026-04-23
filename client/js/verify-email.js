import {
  validateEmail,
  showError,
  bindFieldValidation,
} from './utils/validation.js';
import { AuthService } from './api/authService.js';

const authService = new AuthService();

const form       = document.getElementById('verifyForm');
const emailInput = document.getElementById('email');
const codeInput  = document.getElementById('code');
const submitBtn  = document.getElementById('submitBtn');
const resendBtn  = document.getElementById('resendBtn');
const apiMessage = document.getElementById('apiMessage');
const emailError = document.getElementById('emailError');
const codeError  = document.getElementById('codeError');

// Pre-fill email saved during registration
const pendingEmail = sessionStorage.getItem('pending_email');
if (pendingEmail) {
  emailInput.value = pendingEmail;
}

function setApiMessage(text, isError) {
  apiMessage.textContent = text;
  apiMessage.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

function validateCode(value) {
  if (!value.trim()) return 'Verification code is required.';
  if (!/^\d{6}$/.test(value.trim())) return 'Code must be exactly 6 digits.';
  return '';
}

bindFieldValidation(emailInput, emailError, () => validateEmail(emailInput.value));
bindFieldValidation(codeInput,  codeError,  () => validateCode(codeInput.value));

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
    await authService.verifyEmail(
      emailInput.value.trim(),
      codeInput.value.trim(),
    );

    sessionStorage.removeItem('pending_email');
    setApiMessage('Email verified successfully. Please log in.', false);

    setTimeout(() => {
      window.location.href = 'login.html';
    }, 2000);
  } catch (err) {
    setApiMessage(err.message || 'Verification failed. Please try again.', true);
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
    setApiMessage('A new code has been sent to your email.', false);
  } catch (err) {
    setApiMessage(err.message || 'Failed to resend code. Please try again.', true);
  } finally {
    resendBtn.disabled = false;
  }
});
