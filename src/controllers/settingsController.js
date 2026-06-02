const pool = require('../config/db');

// GET /api/settings
const getSettings = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
        if (result.rows.length === 0) {
            return res.status(200).json({ email_notifications: true, carbon_tips_notifications: true });
        }
        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('[getSettings]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// PUT /api/settings
const updateSettings = async (req, res) => {
    const userId = req.user.id;
    const {
        email_notifications       = true,
        carbon_tips_notifications = true,
    } = req.body;

    try {
        await pool.query(
            `INSERT INTO user_settings (user_id, email_notifications, carbon_tips_notifications, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                 email_notifications       = EXCLUDED.email_notifications,
                 carbon_tips_notifications = EXCLUDED.carbon_tips_notifications,
                 updated_at                = NOW()`,
            [userId, !!email_notifications, !!carbon_tips_notifications]
        );
        return res.status(200).json({ message: 'Ayarlar güncellendi.' });
    } catch (err) {
        console.error('[updateSettings]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

module.exports = { getSettings, updateSettings };
