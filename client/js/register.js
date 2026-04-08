import {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  validateRequired,
  showError,
  bindFieldValidation,
} from './utils/validation.js';

const form          = document.getElementById('registerForm');
const nameInput     = document.getElementById('name');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput  = document.getElementById('confirmPassword');

const nameError     = document.getElementById('nameError');
const emailError    = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');
const confirmError  = document.getElementById('confirmPasswordError');

bindFieldValidation(nameInput,     nameError,     () => validateRequired(nameInput.value, 'Full name'));
bindFieldValidation(emailInput,    emailError,    () => validateEmail(emailInput.value));
bindFieldValidation(passwordInput, passwordError, () => validatePassword(passwordInput.value));
bindFieldValidation(confirmInput,  confirmError,  () => validateConfirmPassword(confirmInput.value, passwordInput.value));

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const nErr = validateRequired(nameInput.value, 'Full name');
  const eErr = validateEmail(emailInput.value);
  const pErr = validatePassword(passwordInput.value);
  const cErr = validateConfirmPassword(confirmInput.value, passwordInput.value);

  showError(nameInput,     nameError,     nErr);
  showError(emailInput,    emailError,    eErr);
  showError(passwordInput, passwordError, pErr);
  showError(confirmInput,  confirmError,  cErr);
});
