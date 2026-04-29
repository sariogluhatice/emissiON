const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');
const { generateVerificationCode } = require('../utils/codeUtils');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/mailService');

const SALT_ROUNDS  = 10;
const EMAIL_REGEX  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES  = ['individual', 'household', 'company'];

// Password must be ≥8 chars with lowercase, uppercase, digit, and symbol.
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;
const STRONG_PASSWORD_MSG   = 'Şifre en az 8 karakter olmalı; büyük harf, küçük harf, rakam ve sembol içermelidir.';

// --- KAYIT (REGISTER) ---
// POST /api/auth/register
// Body: { name, email, password }
const register = async (req, res) => {
    const { name: rawName, email: rawEmail, password, role: rawRole } = req.body;

    const name  = typeof rawName  === 'string' ? rawName.trim()                : '';
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    const role  = VALID_ROLES.includes(rawRole) ? rawRole : 'individual';

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Tüm alanların doldurulması zorunludur.' });
    }

    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ message: 'Geçersiz e-posta formatı.' });
    }

    if (!STRONG_PASSWORD_REGEX.test(password)) {
        return res.status(400).json({ message: STRONG_PASSWORD_MSG });
    }

    try {
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ message: 'E-posta adresi zaten kullanımda.' });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const code           = generateVerificationCode();
        const codeHash       = await bcrypt.hash(code, SALT_ROUNDS);
        const expiresAt      = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const insertResult = await pool.query(
            `INSERT INTO users (name, email, password, role, is_verified, verification_code_hash, verification_code_expires_at)
             VALUES ($1, $2, $3, $4, false, $5, $6)
             RETURNING id`,
            [name, email, hashedPassword, role, codeHash, expiresAt]
        );

        await pool.query(
            'INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)',
            [insertResult.rows[0].id, hashedPassword]
        );

        await sendVerificationEmail(email, code);

        return res.status(201).json({
            message:                    'Verification required',
            requiresEmailVerification:  true,
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ message: 'E-posta adresi zaten kullanımda.' });
        }
        console.error('[register] code:', err.code, '| message:', err.message, '| detail:', err.detail);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// --- E-POSTA DOĞRULAMA (VERIFY EMAIL) ---
// POST /api/auth/verify-email
// Body: { email, code }
const verifyEmail = async (req, res) => {
    const { email: rawEmail, code } = req.body;

    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!email || !code) {
        return res.status(400).json({ message: 'E-posta ve doğrulama kodu gereklidir.' });
    }

    try {
        const result = await pool.query(
            `SELECT id, role, is_verified, verification_code_hash, verification_code_expires_at
             FROM users WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        const user = result.rows[0];

        if (user.is_verified) {
            return res.status(400).json({ message: 'E-posta adresi zaten doğrulanmış.' });
        }

        if (!user.verification_code_hash || !user.verification_code_expires_at) {
            return res.status(400).json({ message: 'Geçerli bir doğrulama kodu bulunamadı.' });
        }

        if (new Date() > new Date(user.verification_code_expires_at)) {
            return res.status(400).json({ message: 'Doğrulama kodunun süresi dolmuş. Lütfen yeni kod talep edin.' });
        }

        const codeMatch = await bcrypt.compare(String(code), user.verification_code_hash);

        if (!codeMatch) {
            return res.status(400).json({ message: 'Geçersiz doğrulama kodu.' });
        }

        await pool.query(
            `UPDATE users
             SET is_verified = true, verified_at = NOW(),
                 verification_code_hash = NULL, verification_code_expires_at = NULL
             WHERE id = $1`,
            [user.id]
        );

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        return res.status(200).json({
            message: 'E-posta başarıyla doğrulandı.',
            token,
        });
    } catch (err) {
        console.error('[verifyEmail] code:', err.code, '| message:', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// --- KOD YENİLE (RESEND CODE) ---
// POST /api/auth/resend-code
// Body: { email }
const resendCode = async (req, res) => {
    const { email: rawEmail } = req.body;

    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!email) {
        return res.status(400).json({ message: 'E-posta adresi gereklidir.' });
    }

    try {
        const result = await pool.query(
            'SELECT id, is_verified FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        const user = result.rows[0];

        if (user.is_verified) {
            return res.status(400).json({ message: 'E-posta adresi zaten doğrulanmış.' });
        }

        const code      = generateVerificationCode();
        const codeHash  = await bcrypt.hash(code, SALT_ROUNDS);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await pool.query(
            `UPDATE users
             SET verification_code_hash = $1, verification_code_expires_at = $2
             WHERE id = $3`,
            [codeHash, expiresAt, user.id]
        );

        await sendVerificationEmail(email, code);

        return res.status(200).json({ message: 'Yeni doğrulama kodu e-posta adresinize gönderildi.' });
    } catch (err) {
        console.error('[resendCode] code:', err.code, '| message:', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// --- GİRİŞ (LOGIN) ---
// POST /api/auth/login
// Body: { email, password }
const login = async (req, res) => {
    const { email: rawEmail, password } = req.body;

    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!email || !password) {
        return res.status(400).json({ message: 'E-posta ve şifre gereklidir.' });
    }

    if (!process.env.JWT_SECRET) {
        console.error('[login] JWT_SECRET is not set');
        return res.status(500).json({ message: 'Server error.' });
    }

    try {
        const result = await pool.query(
            'SELECT id, name, email, password, role, is_verified, onboarding_completed, created_at FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Geçersiz kimlik bilgileri.' });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Geçersiz kimlik bilgileri.' });
        }

        if (!user.is_verified) {
            return res.status(403).json({ message: 'Email not verified' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        return res.status(200).json({
            message: 'Giriş başarılı.',
            token,
            user: {
                id:                   user.id,
                name:                 user.name,
                email:                user.email,
                role:                 user.role,
                onboarding_completed: user.onboarding_completed,
                created_at:           user.created_at,
            },
        });
    } catch (err) {
        console.error('[login] code:', err.code, '| message:', err.message, '| detail:', err.detail);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// --- ŞİFRE SIFIRLAMA TALEBİ (FORGOT PASSWORD) ---
// POST /api/auth/forgot-password
// Body: { email }
const forgotPassword = async (req, res) => {
    const { email: rawEmail } = req.body;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    // Always return the same generic message to prevent email enumeration.
    const GENERIC = { message: 'Eğer bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderilmiştir.' };

    if (!email || !EMAIL_REGEX.test(email)) {
        return res.status(200).json(GENERIC);
    }

    try {
        const result = await pool.query(
            'SELECT id FROM users WHERE email = $1 AND is_verified = true',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(200).json(GENERIC);
        }

        const user      = result.rows[0];
        const rawToken  = crypto.randomBytes(32).toString('hex');
        const tokenHash = await bcrypt.hash(rawToken, SALT_ROUNDS);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await pool.query(
            `UPDATE users SET reset_token_hash = $1, reset_token_expires_at = $2 WHERE id = $3`,
            [tokenHash, expiresAt, user.id]
        );

        const appUrl    = `${req.protocol}://${req.get('host')}`;
        const resetLink = `${appUrl}/pages/reset-password.html?token=${rawToken}&uid=${user.id}`;

        await sendPasswordResetEmail(email, resetLink);

        return res.status(200).json(GENERIC);
    } catch (err) {
        console.error('[forgotPassword] message:', err.message);
        return res.status(200).json(GENERIC); // still generic on unexpected error
    }
};

// --- ŞİFRE SIFIRLAMA (RESET PASSWORD) ---
// POST /api/auth/reset-password
// Body: { uid, token, newPassword }
const resetPassword = async (req, res) => {
    const { uid, token, newPassword } = req.body;

    if (!uid || !token || !newPassword) {
        return res.status(400).json({ message: 'Geçersiz istek.' });
    }

    if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
        return res.status(400).json({ message: STRONG_PASSWORD_MSG });
    }

    try {
        const result = await pool.query(
            `SELECT id, reset_token_hash, reset_token_expires_at
             FROM users
             WHERE id = $1 AND reset_token_hash IS NOT NULL`,
            [uid]
        );

        const INVALID_MSG = { message: 'Geçersiz veya süresi dolmuş şifre sıfırlama bağlantısı.' };

        if (result.rows.length === 0) {
            return res.status(400).json(INVALID_MSG);
        }

        const user = result.rows[0];

        if (new Date() > new Date(user.reset_token_expires_at)) {
            return res.status(400).json({ message: 'Şifre sıfırlama bağlantısının süresi dolmuş. Lütfen yeni bağlantı talep edin.' });
        }

        const tokenMatch = await bcrypt.compare(String(token), user.reset_token_hash);

        if (!tokenMatch) {
            return res.status(400).json(INVALID_MSG);
        }

        // Reject if new password matches any of the last 3 passwords.
        const historyResult = await pool.query(
            `SELECT password_hash FROM password_history
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 3`,
            [user.id]
        );

        for (const row of historyResult.rows) {
            const match = await bcrypt.compare(newPassword, row.password_hash);
            if (match) {
                return res.status(400).json({ message: 'Yeni şifre son 3 şifrenizden farklı olmalıdır.' });
            }
        }

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        await pool.query(
            `UPDATE users
             SET password = $1, reset_token_hash = NULL, reset_token_expires_at = NULL
             WHERE id = $2`,
            [hashedPassword, user.id]
        );

        await pool.query(
            'INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)',
            [user.id, hashedPassword]
        );

        // Prune history; retain only the latest 3 records per user.
        await pool.query(
            `DELETE FROM password_history
             WHERE user_id = $1
               AND id NOT IN (
                   SELECT id FROM password_history
                   WHERE user_id = $1
                   ORDER BY created_at DESC
                   LIMIT 3
               )`,
            [user.id]
        );

        return res.status(200).json({ message: 'Şifreniz başarıyla güncellendi.' });
    } catch (err) {
        console.error('[resetPassword] message:', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

module.exports = { register, verifyEmail, resendCode, login, forgotPassword, resetPassword };
