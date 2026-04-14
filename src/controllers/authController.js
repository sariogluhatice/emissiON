const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');

const SALT_ROUNDS = 10;

// Simple regex: requires @ and a dot after it (e.g. user@example.com)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- REGISTER ---
// POST /api/auth/register
// Body: { name, email, password }
const register = async (req, res) => {
    const { name: rawName, email: rawEmail, password } = req.body;

    // Normalize
    const name  = typeof rawName  === 'string' ? rawName.trim()              : '';
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    // Validation
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ message: 'Invalid email format.' });
    }

    if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    try {
        // Check if the email is already registered
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ message: 'Email is already in use.' });
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
            message: 'Registration successful.',
            user: newUser,
            token,
        });
    } catch (err) {
        // Catch race condition: duplicate email inserted between our check and INSERT
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Email is already in use.' });
        }
        console.error('[register] code:', err.code, '| message:', err.message, '| detail:', err.detail);
        return res.status(500).json({ message: 'Server error.' });
    }
};

// --- LOGIN ---
// POST /api/auth/login
// Body: { email, password }
const login = async (req, res) => {
    const { email: rawEmail, password } = req.body;

    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
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
            // Generic message: don't reveal whether the email exists
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        return res.status(200).json({
            message: 'Login successful.',
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
        return res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = { register, login };
