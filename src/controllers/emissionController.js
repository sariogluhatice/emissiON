const pool = require('../config/db');
const climatiqService = require('../services/climatiqService');
const aiService = require('../services/aiService');

// --- HESAPLA (CALCULATE) ---
// POST /api/emissions/calculate
// Gövde (Body): { activityId, quantity, unit, activityLabel } VEYA { from, to, flightClass }
const calculate = async (req, res) => {
    const { activityId, quantity, unit, from, to, flightClass, activityLabel } = req.body;

    try {
        let result;
        // Eğer 'from' ve 'to' sağlanmışsa, bunun bir uçuş rotası hesaplaması olduğunu varsayalım
        if (from && to) {
            result = await climatiqService.calculateFlightEmission(from, to, flightClass);
        } else {
            if (!activityId || !quantity || !unit) {
                return res.status(400).json({ message: 'Genel hesaplama için activityId, miktar (quantity) ve birim (unit) gereklidir.' });
            }
            result = await climatiqService.calculateEmission(activityId, quantity, unit);
        }
        
        // Hızlı yanıt: AI beklemeden sadece sonucu dönüyoruz
        return res.status(200).json(result);
    } catch (err) {
        console.error('[emissions.calculate]', err.message);
        return res.status(500).json({ message: err.message || 'Climatiq hesaplaması başarısız oldu.' });
    }
};

/**
 * AI İçgörüsü Oluştur (Generate AI Insight)
 * Bağımsız bir endpoint olarak çağrılır, böylece ana hesaplamayı yavaşlatmaz.
 */
const generateInsight = async (req, res) => {
    const { activityLabel, co2e, unit, category } = req.body;

    if (!activityLabel || co2e === undefined || !unit) {
        return res.status(400).json({ message: 'Eksik veri: activityLabel, co2e ve unit gereklidir.' });
    }

    try {
        const insight = await aiService.generateImpactInsight(activityLabel, co2e, unit, category);
        return res.status(200).json({ aiInsight: insight });
    } catch (err) {
        console.error('[emissions.generateInsight]', err.message);
        return res.status(500).json({ message: 'AI içgörüsü oluşturulamadı.' });
    }
};

// --- TÜMÜNÜ GETİR (GET ALL) ---
// GET /api/emissions
// Giriş yapmış kullanıcının tüm emisyon kayıtlarını döndürür (en yeni en başta).
const getAll = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, source, amount, date, created_at
             FROM emission_records
             WHERE user_id = $1
             ORDER BY date DESC`,
            [req.user.id]
        );
        return res.status(200).json({ records: result.rows });
    } catch (err) {
        console.error('[emissions.getAll]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// --- OLUŞTUR (CREATE) ---
// POST /api/emissions
// Gövde (Body): { source, amount, date }
const create = async (req, res) => {
    const { source: rawSource, amount, date } = req.body;
    const source = typeof rawSource === 'string' ? rawSource.trim() : '';

    if (!source || amount === undefined || !date) {
        return res.status(400).json({ message: 'Kaynak (source), miktar (amount) ve tarih (date) gereklidir.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Miktar pozitif bir sayı olmalıdır.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO emission_records (user_id, source, amount, date)
             VALUES ($1, $2, $3, $4)
             RETURNING id, source, amount, date, created_at`,
            [req.user.id, source, parsedAmount, date]
        );
        return res.status(201).json({
            message: 'Kayıt oluşturuldu.',
            record: result.rows[0],
        });
    } catch (err) {
        console.error('[emissions.create]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// --- GÜNCELLE (UPDATE) ---
// PUT /api/emissions/:id
const update = async (req, res) => {
    const { id } = req.params;
    const { source: rawSource, amount, date } = req.body;
    const source = typeof rawSource === 'string' ? rawSource.trim() : '';

    if (!source || amount === undefined || !date) {
        return res.status(400).json({ message: 'Kaynak (source), miktar (amount) ve tarih (date) gereklidir.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Miktar pozitif bir sayı olmalıdır.' });
    }

    try {
        const result = await pool.query(
            `UPDATE emission_records
             SET source = $1, amount = $2, date = $3
             WHERE id = $4 AND user_id = $5
             RETURNING id, source, amount, date, created_at`,
            [source, parsedAmount, date, id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Kayıt bulunamadı.' });
        }

        return res.status(200).json({
            message: 'Kayıt güncellendi.',
            record: result.rows[0],
        });
    } catch (err) {
        console.error('[emissions.update]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// --- SİL (DELETE) ---
// DELETE /api/emissions/:id
const remove = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `DELETE FROM emission_records
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Kayıt bulunamadı.' });
        }

        return res.status(200).json({ message: 'Kayıt silindi.' });
    } catch (err) {
        console.error('[emissions.remove]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

module.exports = { getAll, create, update, remove, calculate, generateInsight };
