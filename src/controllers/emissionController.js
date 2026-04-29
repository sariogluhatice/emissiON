const pool = require('../config/db');
const climatiqService = require('../services/climatiqService');
const aiService = require('../services/aiService');
const textractService = require('../services/textractService');

const normalizeExtractedBillData = (raw = {}) => {
    const allowedCategories = ['electricity', 'water', 'natural_gas'];
    const category = allowedCategories.includes(raw.category) ? raw.category : null;

    const quantity = Number(raw.quantity);
    const normalizedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : null;

    const unit = typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : null;

    const activityType = typeof raw.activity_type === 'string' && raw.activity_type.trim()
        ? raw.activity_type.trim()
        : null;

    const dateMatch = String(raw.date || '').match(/^\d{4}-\d{2}$/);
    const date = dateMatch ? dateMatch[0] : null;

    return {
        category,
        activity_type: activityType,
        quantity: normalizedQuantity,
        unit,
        date,
    };
};

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

// --- OCR FATURA VERI CIKARIMI ---
// POST /api/emissions/extract-ocr
// Govde (Body): { ocrText }
const extractOcrBillData = async (req, res) => {
    const { ocrText } = req.body;

    if (!ocrText || String(ocrText).trim().length < 20) {
        return res.status(400).json({ message: 'OCR metni gecersiz veya cok kisa.' });
    }

    try {
        const extracted = await aiService.extractUtilityBillData(ocrText);
        const normalized = normalizeExtractedBillData(extracted);

        return res.status(200).json({ extracted: normalized });
    } catch (err) {
        console.error('[emissions.extractOcrBillData]', err.message);
        return res.status(500).json({ message: err.message || 'OCR veri cikarma basarisiz oldu.' });
    }
};

// --- AWS TEXTRACT + AI VERI CIKARIMI ---
// POST /api/emissions/extract-ocr-image
// Govde (Body): { imageBase64 }
const extractOcrFromImage = async (req, res) => {
    const { imageBase64 } = req.body;

    if (!imageBase64 || String(imageBase64).length < 100) {
        return res.status(400).json({ message: 'Gorsel verisi gecersiz veya eksik.' });
    }

    try {
        const mimeTypeMatch = String(imageBase64).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

        const uploaded = await textractService.uploadImageToS3(imageBase64, mimeType);
        const ocrText = await textractService.extractTextFromS3Object(uploaded.bucket, uploaded.key);

        if (!ocrText || ocrText.length < 20) {
            return res.status(200).json({
                ocrText: ocrText || '',
                extracted: {
                    category: null,
                    activity_type: null,
                    quantity: null,
                    unit: null,
                    date: null,
                }
            });
        }

        const extracted = await aiService.extractUtilityBillData(ocrText);
        const normalized = normalizeExtractedBillData(extracted);

        return res.status(200).json({ ocrText, extracted: normalized, source: uploaded });
    } catch (err) {
        console.error('[emissions.extractOcrFromImage]', err.message);
        return res.status(500).json({ message: err.message || 'Textract OCR islemi basarisiz oldu.' });
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

// --- AKILLI ANALIZ (SMART INSIGHTS) ---
// GET /api/emissions/smart-insights
const getSmartInsights = async (req, res) => {
    const userId = req.user.id;
    const role   = req.user.role;

    try {
        // 1. Geçmiş Verileri Çek (Aylık Toplamlar)
        const historyResult = await pool.query(
            `SELECT 
                TO_CHAR(date, 'YYYY-MM') as month, 
                SUM(amount) as total_amount
             FROM emission_records
             WHERE user_id = $1
             GROUP BY month
             ORDER BY month DESC
             LIMIT 6`,
            [userId]
        );

        // 1b. Kategori Dağılımını Çek (Hangi kaynaklardan ne kadar salınım yapılmış?)
        const categoryResult = await pool.query(
            `SELECT source as category, SUM(amount) as total
             FROM emission_records
             WHERE user_id = $1
             GROUP BY source
             ORDER BY total DESC`,
            [userId]
        );

        // 2. Kullanıcı Profilini Çek
        const tableMap = {
            individual: 'individual_profiles',
            household:  'household_profiles',
            company:    'company_profiles',
        };
        const profileTable = tableMap[role];
        let profile = null;

        if (profileTable) {
            const profileResult = await pool.query(
                `SELECT * FROM ${profileTable} WHERE user_id = $1`,
                [userId]
            );
            profile = profileResult.rows[0] || null;
        }

        // 3. AI Servisini Çağır (Geçmiş, Profil ve Kategori verilerini gönderiyoruz)
        const insights = await aiService.getSmartInsights(historyResult.rows, profile, categoryResult.rows);

        return res.status(200).json(insights);
    } catch (err) {
        console.error('[emissions.getSmartInsights]', err.message);
        return res.status(500).json({ message: 'Akıllı analizler şu an hazırlanamıyor.' });
    }
};

module.exports = { getAll, create, update, remove, calculate, generateInsight, extractOcrBillData, extractOcrFromImage, getSmartInsights };
