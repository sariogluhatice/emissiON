const bcrypt = require('bcryptjs');
const pool   = require('../config/db');
const { generateVerificationCode } = require('../utils/codeUtils');
const { normalizeName } = require('../utils/nameUtils');
const {
    sendEmailChangeVerification,
    sendPasswordChangeVerification,
    sendEmailChangedAlert,
    sendPasswordChangedAlert,
} = require('../services/mailService');

const { EMAIL_REGEX, STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MSG } = require('../utils/validators');
const PROFILE_TABLES = require('../utils/profileTables');

const SALT_ROUNDS    = 10;
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// ── GET /api/profile ─────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
    const userId = req.user.id;
    const role   = req.user.role;
    const table  = PROFILE_TABLES[role];

    try {
        const [userResult, profileResult, answersResult, settingsResult] = await Promise.all([
            pool.query(
                'SELECT id, name, email, role, is_verified, onboarding_completed, created_at FROM users WHERE id = $1',
                [userId]
            ),
            table
                ? pool.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId])
                : Promise.resolve({ rows: [] }),
            pool.query('SELECT answers FROM onboarding_answers WHERE user_id = $1', [userId]),
            pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]),
        ]);

        return res.status(200).json({
            user:     userResult.rows[0]            ?? null,
            profile:  profileResult.rows[0]         ?? null,
            answers:  answersResult.rows[0]?.answers ?? null,
            settings: settingsResult.rows[0]        ?? null,
        });
    } catch (err) {
        console.error('[getProfile]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// ── PUT /api/profile  (name only) ─────────────────────────────────────────────
const updateProfile = async (req, res) => {
    const userId = req.user.id;
    const { name: rawName } = req.body;
    const name = normalizeName(rawName);

    if (!name || name.length < 2) {
        return res.status(400).json({ message: 'Name must be at least 2 characters.' });
    }

    try {
        await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, userId]);

        const result = await pool.query(
            'SELECT id, name, email, role, onboarding_completed, created_at FROM users WHERE id = $1',
            [userId]
        );

        return res.status(200).json({ message: 'Name updated.', user: result.rows[0] });
    } catch (err) {
        console.error('[updateProfile]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// ── POST /api/profile/email-change/request ───────────────────────────────────
const requestEmailChange = async (req, res) => {
    const userId = req.user.id;
    const { newEmail: rawEmail } = req.body;
    const newEmail = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!newEmail || !EMAIL_REGEX.test(newEmail)) {
        return res.status(400).json({ message: 'Geçersiz e-posta formatı.' });
    }

    try {
        const userResult = await pool.query(
            'SELECT email FROM users WHERE id = $1',
            [userId]
        );
        if (!userResult.rows[0]) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        const currentEmail = userResult.rows[0].email;

        if (newEmail === currentEmail) {
            return res.status(400).json({ message: 'Yeni e-posta mevcut e-posta ile aynı.' });
        }

        const existing = await pool.query(
            'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2',
            [newEmail, userId]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ message: 'Bu e-posta adresi zaten kullanımda.' });
        }

        const code      = generateVerificationCode();
        const codeHash  = await bcrypt.hash(code, SALT_ROUNDS);
        const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

        // Clear any previous pending requests before creating a new one
        await pool.query('DELETE FROM pending_email_changes WHERE user_id = $1', [userId]);

        await pool.query(
            `INSERT INTO pending_email_changes (user_id, new_email, code_hash, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [userId, newEmail, codeHash, expiresAt]
        );

        // Security codes are always sent regardless of notification preferences
        await sendEmailChangeVerification(newEmail, code);

        return res.status(200).json({ message: 'Doğrulama kodu yeni e-posta adresinize gönderildi.' });
    } catch (err) {
        console.error('[requestEmailChange]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// ── POST /api/profile/email-change/verify ────────────────────────────────────
const verifyEmailChange = async (req, res) => {
    const userId = req.user.id;
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ message: 'Doğrulama kodu gereklidir.' });
    }

    const INVALID = { message: 'Geçersiz veya süresi dolmuş doğrulama kodu.' };

    try {
        const pendingResult = await pool.query(
            `SELECT * FROM pending_email_changes
             WHERE user_id = $1 AND consumed_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );

        if (pendingResult.rows.length === 0) {
            return res.status(400).json(INVALID);
        }

        const pending = pendingResult.rows[0];

        if (new Date() > new Date(pending.expires_at)) {
            return res.status(400).json({ message: 'Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin.' });
        }

        const codeMatch = await bcrypt.compare(String(code), pending.code_hash);
        if (!codeMatch) {
            return res.status(400).json(INVALID);
        }

        // Re-check uniqueness: another user might have registered this email in the meantime
        const raceCheck = await pool.query(
            'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2',
            [pending.new_email, userId]
        );
        if (raceCheck.rows.length > 0) {
            return res.status(409).json({ message: 'Bu e-posta artık başka bir kullanıcı tarafından kullanılıyor.' });
        }

        // Get old email for the security alert
        const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
        const oldEmail   = userResult.rows[0]?.email;

        // Apply the change
        await pool.query('UPDATE users SET email = $1 WHERE id = $2', [pending.new_email, userId]);

        // Mark consumed (not deleted, for audit purposes)
        await pool.query(
            'UPDATE pending_email_changes SET consumed_at = NOW() WHERE id = $1',
            [pending.id]
        );

        // Send confirmation to old email only if email_notifications enabled
        const settingsResult = await pool.query(
            'SELECT email_notifications FROM user_settings WHERE user_id = $1',
            [userId]
        );
        const emailNotif = settingsResult.rows[0]?.email_notifications !== false; // default true
        if (emailNotif && oldEmail) {
            await sendEmailChangedAlert(oldEmail, pending.new_email);
        }

        return res.status(200).json({
            message: 'E-posta başarıyla güncellendi. Lütfen tekrar giriş yapın.',
            requiresRelogin: true,
        });
    } catch (err) {
        console.error('[verifyEmailChange]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// ── POST /api/profile/password-change/request ────────────────────────────────
const requestPasswordChange = async (req, res) => {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Mevcut ve yeni şifre gereklidir.' });
    }

    if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
        return res.status(400).json({ message: STRONG_PASSWORD_MSG });
    }

    try {
        const userResult = await pool.query(
            'SELECT password, email FROM users WHERE id = $1',
            [userId]
        );
        if (!userResult.rows[0]) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        const { password: currentHash, email } = userResult.rows[0];

        const match = await bcrypt.compare(currentPassword, currentHash);
        if (!match) {
            return res.status(400).json({ message: 'Mevcut şifre yanlış.' });
        }

        // Check against password history
        const historyResult = await pool.query(
            'SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
            [userId]
        );
        for (const row of historyResult.rows) {
            const reuse = await bcrypt.compare(newPassword, row.password_hash);
            if (reuse) {
                return res.status(400).json({ message: 'Yeni şifre son 3 şifrenizden farklı olmalıdır.' });
            }
        }

        // Hash new password before storing — raw value never persisted
        const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        const code      = generateVerificationCode();
        const codeHash  = await bcrypt.hash(code, SALT_ROUNDS);
        const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

        // Replace any previous pending request
        await pool.query('DELETE FROM pending_password_changes WHERE user_id = $1', [userId]);

        await pool.query(
            `INSERT INTO pending_password_changes (user_id, new_password_hash, code_hash, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [userId, newPasswordHash, codeHash, expiresAt]
        );

        // Security codes are always sent regardless of notification preferences
        await sendPasswordChangeVerification(email, code);

        return res.status(200).json({ message: 'Doğrulama kodu e-posta adresinize gönderildi.' });
    } catch (err) {
        console.error('[requestPasswordChange]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// ── POST /api/profile/password-change/verify ─────────────────────────────────
const verifyPasswordChange = async (req, res) => {
    const userId = req.user.id;
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ message: 'Doğrulama kodu gereklidir.' });
    }

    const INVALID = { message: 'Geçersiz veya süresi dolmuş doğrulama kodu.' };

    try {
        const pendingResult = await pool.query(
            `SELECT * FROM pending_password_changes
             WHERE user_id = $1 AND consumed_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );

        if (pendingResult.rows.length === 0) {
            return res.status(400).json(INVALID);
        }

        const pending = pendingResult.rows[0];

        if (new Date() > new Date(pending.expires_at)) {
            return res.status(400).json({ message: 'Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin.' });
        }

        const codeMatch = await bcrypt.compare(String(code), pending.code_hash);
        if (!codeMatch) {
            return res.status(400).json(INVALID);
        }

        // Get current email for the security alert
        const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
        const email      = userResult.rows[0]?.email;

        // Apply hashed password (never touched the raw value)
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [pending.new_password_hash, userId]);

        // Update password history
        await pool.query(
            'INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)',
            [userId, pending.new_password_hash]
        );
        await pool.query(
            `DELETE FROM password_history
             WHERE user_id = $1
               AND id NOT IN (
                   SELECT id FROM password_history WHERE user_id = $1
                   ORDER BY created_at DESC LIMIT 3
               )`,
            [userId]
        );

        // Mark consumed
        await pool.query(
            'UPDATE pending_password_changes SET consumed_at = NOW() WHERE id = $1',
            [pending.id]
        );

        // Send security alert only if email_notifications enabled
        const settingsResult = await pool.query(
            'SELECT email_notifications FROM user_settings WHERE user_id = $1',
            [userId]
        );
        const emailNotif = settingsResult.rows[0]?.email_notifications !== false;
        if (emailNotif && email) {
            await sendPasswordChangedAlert(email);
        }

        return res.status(200).json({
            message: 'Şifreniz başarıyla güncellendi. Lütfen tekrar giriş yapın.',
            requiresRelogin: true,
        });
    } catch (err) {
        console.error('[verifyPasswordChange]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// ── DELETE /api/profile ───────────────────────────────────────────────────────
const deleteAccount = async (req, res) => {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ message: 'Hesabı silmek için şifrenizi girin.' });
    }

    try {
        const result = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
        if (!result.rows[0]) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        const match = await bcrypt.compare(password, result.rows[0].password);
        if (!match) {
            return res.status(400).json({ message: 'Şifre yanlış. Hesap silinmedi.' });
        }

        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        return res.status(200).json({ message: 'Hesap silindi.' });
    } catch (err) {
        console.error('[deleteAccount]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    requestEmailChange,
    verifyEmailChange,
    requestPasswordChange,
    verifyPasswordChange,
    deleteAccount,
};
