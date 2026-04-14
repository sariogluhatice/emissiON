import {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  validateRequired,
  showError,
  bindFieldValidation,
} from './utils/validation.js';
import { AuthService } from './api/authService.js';

const authService = new AuthService();

const form          = document.getElementById('registerForm');
const nameInput     = document.getElementById('name');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput  = document.getElementById('confirmPassword');
const submitBtn     = document.getElementById('submitBtn');
const apiMessage    = document.getElementById('apiMessage');

const nameError     = document.getElementById('nameError');
const emailError    = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');
const confirmError  = document.getElementById('confirmPasswordError');

bindFieldValidation(nameInput,     nameError,     () => validateRequired(nameInput.value, 'Full name'));
bindFieldValidation(emailInput,    emailError,    () => validateEmail(emailInput.value));
bindFieldValidation(passwordInput, passwordError, () => validatePassword(passwordInput.value));
bindFieldValidation(confirmInput,  confirmError,  () => validateConfirmPassword(confirmInput.value, passwordInput.value));

function setApiMessage(text, isError) {
  apiMessage.textContent = text;
  apiMessage.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nErr = validateRequired(nameInput.value, 'Full name');
  const eErr = validateEmail(emailInput.value);
  const pErr = validatePassword(passwordInput.value);
  const cErr = validateConfirmPassword(confirmInput.value, passwordInput.value);

  showError(nameInput,     nameError,     nErr);
  showError(emailInput,    emailError,    eErr);
  showError(passwordInput, passwordError, pErr);
  showError(confirmInput,  confirmError,  cErr);

  if (nErr || eErr || pErr || cErr) return;

  submitBtn.disabled = true;
  setApiMessage('', false);

  try {
    await authService.register(
      nameInput.value.trim(),
      emailInput.value.trim(),
      passwordInput.value,
    );
    setApiMessage('Account created! Redirecting…', false);
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1500);
  } catch (err) {
    setApiMessage(err.message || 'Registration failed. Please try again.', true);
    submitBtn.disabled = false;
  }
});
