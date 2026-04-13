import {
  validateEmail,
  validatePassword,
  showError,
  bindFieldValidation,
} from './utils/validation.js';
import { AuthService } from './api/authService.js';

const form          = document.getElementById('loginForm');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const emailError    = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');
const apiMessage    = document.getElementById('apiMessage');
const submitBtn     = document.getElementById('submitBtn');

const authService = new AuthService();

bindFieldValidation(emailInput,    emailError,    () => validateEmail(emailInput.value));
bindFieldValidation(passwordInput, passwordError, () => validatePassword(passwordInput.value, 1));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Temel doğrulama
  const eErr = validateEmail(emailInput.value);
  const pErr = validatePassword(passwordInput.value, 1);

  showError(emailInput,    emailError,    eErr);
  showError(passwordInput, passwordError, pErr);
  
  apiMessage.textContent = '';
  apiMessage.className = 'api-message';

  if (eErr || pErr) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in…';

  try {
    const response = await authService.login(emailInput.value, passwordInput.value);
    
    // API'den gelen kullanıcı verisini kaydet (Dashboard'da görünmesi için)
    if (response?.user) {
        localStorage.setItem('user', JSON.stringify(response.user));
    }

    apiMessage.textContent = 'Login successful! Redirecting…';
    apiMessage.classList.add('is-success');

    // Başarılı girişte Dashboard'a yönlendir
    setTimeout(() => {
        window.location.href = './dashboard.html';
    }, 1000);

  } catch (err) {
    console.error('Login error:', err);
    apiMessage.textContent = err.message || 'Login failed. Please check your credentials.';
    apiMessage.classList.add('is-error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Login';
  }
});
