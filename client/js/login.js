import {
  validateEmail,
  validatePassword,
  showError,
  bindFieldValidation,
} from './utils/validation.js';
import { apiFetch } from './utils/api.js';

const form          = document.getElementById('loginForm');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn     = document.getElementById('submitBtn');
const apiMessage    = document.getElementById('apiMessage');
const emailError    = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');

bindFieldValidation(emailInput,    emailError,    () => validateEmail(emailInput.value));
bindFieldValidation(passwordInput, passwordError, () => validatePassword(passwordInput.value, 1));

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

  const { ok, data } = await apiFetch('/api/auth/login', {
    email:    emailInput.value.trim(),
    password: passwordInput.value,
  });

  if (ok) {
    localStorage.setItem('token', data.token);
    setApiMessage('Login successful! Redirecting…', false);
    setTimeout(() => {
      window.location.href = '../index.html';
    }, 1000);
  } else {
    setApiMessage(data.message || 'Login failed. Please try again.', true);
    submitBtn.disabled = false;
  }
});
