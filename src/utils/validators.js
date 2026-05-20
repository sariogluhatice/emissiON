const EMAIL_REGEX           = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;
const STRONG_PASSWORD_MSG   = 'Şifre en az 8 karakter olmalı; büyük harf, küçük harf, rakam ve sembol içermelidir.';

module.exports = { EMAIL_REGEX, STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MSG };
