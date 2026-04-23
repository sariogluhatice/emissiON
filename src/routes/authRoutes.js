const express = require('express');
const { register, verifyEmail, resendCode, login } = require('../controllers/authController');

const router = express.Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/verify-email
router.post('/verify-email', verifyEmail);

// POST /api/auth/resend-code
router.post('/resend-code', resendCode);

// POST /api/auth/login
router.post('/login', login);

module.exports = router;
