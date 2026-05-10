/* ============================================================
   UTILS / VALIDATION — paylaşılan, saf doğrulama fonksiyonları
   ============================================================ */

export function validateEmail(value) {
  if (!value.trim()) return 'E-posta adresi zorunludur.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Geçerli bir e-posta adresi girin.';
  return '';
}

export function validatePassword(value, minLength = 8) {
  if (!value) return 'Şifre zorunludur.';
  if (value.length < minLength) return `Şifre en az ${minLength} karakter olmalıdır.`;
  return '';
}

export function validateStrongPassword(value) {
  if (!value) return 'Şifre zorunludur.';
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/.test(value)) {
    return 'Şifre en az 8 karakter olmalı; büyük harf, küçük harf, rakam ve sembol içermelidir.';
  }
  return '';
}

export function validateConfirmPassword(value, original) {
  if (!value) return 'Lütfen şifrenizi onaylayın.';
  if (value !== original) return 'Şifreler eşleşmiyor.';
  return '';
}

export function validateRequired(value, fieldName = 'Bu alan') {
  if (!value.trim()) return `${fieldName} zorunludur.`;
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
