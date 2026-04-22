const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');

const SALT_ROUNDS = 10;

// Basit regex: @ işareti ve sonrasında bir nokta gerektirir (örneğin: kullanici@ornek.com)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- KAYIT (REGISTER) ---
// POST /api/auth/register
// Gövde (Body): { name, email, password }
const register = async (req, res) => {
    const { name: rawName, email: rawEmail, password } = req.body;

    // Verileri normalleştir (boşlukları temizle vb.)
    const name  = typeof rawName  === 'string' ? rawName.trim()              : '';
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    // Doğrulama (Validation)
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
        // E-postanın zaten kayıtlı olup olmadığını kontrol et
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ message: 'E-posta adresi zaten kullanımda.' });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const result = await pool.query(
            `INSERT INTO users (name, email, password)
             VALUES ($1, $2, $3)
             RETURNING id, name, email, role, created_at`,
            [name, email, hashedPassword]
        );

        const newUser = result.rows[0];

        const token = jwt.sign(
            { id: newUser.id, role: newUser.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        return res.status(201).json({
            message: 'Kayıt başarılı.',
            user: newUser,
            token,
        });
    } catch (err) {
        // Çakışma durumunu yakala: Kontrolümüz ile INSERT arasında aynı e-posta kaydedilmiş olabilir
        if (err.code === '23505') {
            return res.status(409).json({ message: 'E-posta adresi zaten kullanımda.' });
        }
        console.error('[register] code:', err.code, '| message:', err.message, '| detail:', err.detail);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// --- GİRİŞ (LOGIN) ---
// POST /api/auth/login
// Gövde (Body): { email, password }
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
        // Explicit field list instead of SELECT * — avoids pulling unexpected columns
        const result = await pool.query(
            'SELECT id, name, email, password, role, created_at FROM users WHERE email = $1',
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

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        return res.status(200).json({
            message: 'Giriş başarılı.',
            token,
            user: {
                id:         user.id,
                name:       user.name,
                email:      user.email,
                role:       user.role,
                created_at: user.created_at,
            },
        });
    } catch (err) {
        console.error('[login] code:', err.code, '| message:', err.message, '| detail:', err.detail);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

module.exports = { register, login };
