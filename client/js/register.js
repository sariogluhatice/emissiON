import {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  validateRequired,
  showError,
  bindFieldValidation,
} from './utils/validation.js';
import { AuthService } from './api/authService.js';

const form          = document.getElementById('registerForm');
const nameInput     = document.getElementById('name');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput  = document.getElementById('confirmPassword');

const nameError     = document.getElementById('nameError');
const emailError    = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');
const confirmError  = document.getElementById('confirmPasswordError');
const apiMessage    = document.getElementById('apiMessage');
const submitBtn     = document.getElementById('submitBtn');

const authService = new AuthService();

bindFieldValidation(nameInput,     nameError,     () => validateRequired(nameInput.value, 'Full name'));
bindFieldValidation(emailInput,    emailError,    () => validateEmail(emailInput.value));
bindFieldValidation(passwordInput, passwordError, () => validatePassword(passwordInput.value));
bindFieldValidation(confirmInput,  confirmError,  () => validateConfirmPassword(confirmInput.value, passwordInput.value));

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

  apiMessage.textContent = '';
  apiMessage.className = 'api-message';

  if (nErr || eErr || pErr || cErr) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Registering…';

  try {
    await authService.register(nameInput.value, emailInput.value, passwordInput.value);
    
    apiMessage.textContent = 'Account created! Redirecting to login…';
    apiMessage.classList.add('is-success');

    // Registration successful — redirect to login
    setTimeout(() => {
        window.location.href = './login.html';
    }, 1500);
  } catch (err) {
    console.error('Registration error:', err);
    apiMessage.textContent = err.message || 'Registration failed. Please try again.';
    apiMessage.classList.add('is-error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Register';
  }
});
