/* ============================================================
   UTILS / VALIDATION — paylaşılan, saf doğrulama fonksiyonları
   ============================================================ */

export function validateEmail(value) {
  if (!value.trim()) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email address.';
  return '';
}

export function validatePassword(value, minLength = 8) {
  if (!value) return 'Password is required.';
  if (value.length < minLength) return `Password must be at least ${minLength} characters.`;
  return '';
}

export function validateStrongPassword(value) {
  if (!value) return 'Password is required.';
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/.test(value)) {
    return 'Şifre en az 8 karakter olmalı; büyük harf, küçük harf, rakam ve sembol içermelidir.';
  }
  return '';
}

export function validateConfirmPassword(value, original) {
  if (!value) return 'Please confirm your password.';
  if (value !== original) return 'Passwords do not match.';
  return '';
}

export function validateRequired(value, fieldName = 'This field') {
  if (!value.trim()) return `${fieldName} is required.`;
  return '';
}

export function showError(input, errorEl, message) {
  errorEl.textContent = message;
  if (message) {
    input.classList.add('is-invalid');
  } else {
    input.classList.remove('is-invalid');
  }
}

export function bindFieldValidation(input, errorEl, validateFn) {
  input.addEventListener('blur', () => {
    showError(input, errorEl, validateFn());
  });

  input.addEventListener('input', () => {
    if (input.classList.contains('is-invalid')) {
      showError(input, errorEl, validateFn());
    }
  });
}
