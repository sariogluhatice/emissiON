const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');
const { generateVerificationCode } = require('../utils/codeUtils');
const { sendVerificationEmail }    = require('../services/mailService');

const SALT_ROUNDS  = 10;
const EMAIL_REGEX  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES  = ['individual', 'household', 'company'];

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

    if (password.length < 8) {
        return res.status(400).json({ message: 'Şifre en az 8 karakter olmalıdır.' });
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

        await pool.query(
            `INSERT INTO users (name, email, password, role, is_verified, verification_code_hash, verification_code_expires_at)
             VALUES ($1, $2, $3, $4, false, $5, $6)`,
            [name, email, hashedPassword, role, codeHash, expiresAt]
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

module.exports = { register, verifyEmail, resendCode, login };
