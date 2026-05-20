const pool = require('../config/db');
const climatiqService = require('../services/climatiqService');
const aiService = require('../services/aiService');
const textractService = require('../services/textractService');
const gamService = require('../services/gamificationService');
const { normalizeCategory, isCanonical } = require('../utils/categoryNormalizer');

const normalizeExtractedBillData = (raw = {}) => {
    // Accept any canonical category; null means AI couldn't identify the bill type.
    const category = raw.category && isCanonical(raw.category) ? raw.category : null;

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
const VALID_FOOD_TYPES = Object.keys(climatiqService.FOOD_ACTIVITY_MAP);

const calculate = async (req, res) => {
    const { activityId, quantity, unit, from, to, flightClass, activityLabel, category, activityType } = req.body;

    try {
        let result;
        if (from && to) {
            result = await climatiqService.calculateFlightEmission(from, to, flightClass);
        } else if (activityId) {
            // Generic Climatiq flow — spend-based activities (vegetables, plastic, shopping…)
            if (!quantity || !unit) {
                return res.status(400).json({ message: 'Genel hesaplama için activityId, miktar (quantity) ve birim (unit) gereklidir.' });
            }
            console.log('[calculate] generic activityId flow', { activityId, quantity, unit, category });
            result = await climatiqService.calculateEmission(activityId, quantity, unit);
        } else if (category === 'food') {
            // kg-based food: beef_red_meat, chicken, rice_grains
            if (!VALID_FOOD_TYPES.includes(activityType)) {
                return res.status(400).json({ message: 'Geçersiz gıda türü. beef_red_meat, chicken veya rice_grains olmalıdır.' });
            }
            const amt = parseFloat(quantity);
            if (!Number.isFinite(amt) || amt <= 0) {
                return res.status(400).json({ message: 'Miktar pozitif bir sayı olmalıdır.' });
            }
            console.log('[calculate] food kg flow', { activityType, quantity });
            result = await climatiqService.calculateFoodEmission(activityType, amt);
        } else {
            return res.status(400).json({ message: 'Genel hesaplama için activityId, miktar (quantity) ve birim (unit) gereklidir.' });
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
        console.log('[DEBUG Textract raw text]:\n', ocrText || '(empty)');

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

        gamService.awardXp(req.user.id, 'ocr_invoice_processed').catch(() => {});
        return res.status(200).json({ ocrText, extracted: normalized, source: uploaded });
    } catch (err) {
        console.error('[emissions.extractOcrFromImage]', err.message);
        return res.status(500).json({ message: err.message || 'Textract OCR islemi basarisiz oldu.' });
    }
};

// --- GROQ OCR PARSING ---
// POST /api/emissions/parse-ocr-groq
// Body: { ocrText }
const parseOcrWithGroq = async (req, res) => {
    const { ocrText } = req.body;

    if (!ocrText || String(ocrText).trim().length < 10) {
        return res.status(400).json({ message: 'OCR metni geçersiz veya çok kısa.' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        return res.status(500).json({ message: 'GROQ_API_KEY yapılandırılmamış.' });
    }

    const prompt = `You are an invoice parser for a carbon footprint web application.
Extract only the requested fields from the OCR text.
Return valid JSON only. No markdown. No explanation.

CATEGORY RULES — read carefully, apply in this exact priority order:

STEP 1 — Shopping detection (highest priority):
If ANY of these phrases appear in the OCR text, category MUST be "shopping":
  "satış internet üzerinden", "mağaza adı", "sipariş", "kargo", "kredi kartı",
  "birim fiyat", "web adresi", "ürün", "mal hizmet", "adet"
SHOPPING WINS even if "elektronik" or "e-fatura" also appears.

STEP 2 — E-invoice document markers (NOT electricity signals):
The following words indicate the document FORMAT is digital — they are NOT electricity signals.
NEVER classify as electricity based on these alone:
  "elektronik", "e-fatura", "e-arşiv", "efatura", "earsiv", "belge tipi elektronik",
  "elektronik olarak iletilmiştir", "e-archive", "e-invoice", "ELEKTRONIK"

STEP 3 — Genuine utility signals only:
- category "energy": ONLY if you see kWh, aktif enerji, tesisat no, sayaç, dağıtım bedeli,
  enerji bedeli, elektrik tüketimi, elektrik faturası, electric supply.
  "elektronik" alone is NEVER an energy signal.
- category "water": ONLY if you see su tüketimi, m³ (for water), water supply, su faturası.
- category "gas": ONLY if you see doğalgaz, sm3, gaz faturası, natural gas.
- Otherwise → category: "shopping".

AMOUNT RULES:
- totalAmount must be a number or null.
- Use this priority order for amount labels:
  1) Ödenecek Tutar  2) Vergiler Dahil Toplam Tutar  3) Genel Toplam  4) Toplam Tutar
- NEVER extract as totalAmount: KDV Matrahı, Vergi Hariç Tutar, Mal Hizmet Toplam Tutarı,
  invoice number, tax number, subscriber number, kWh value, m³ value, VAT amount, unit price.
- Turkish number format: "1.392,30 TL" → 1392.30 (dot=thousands, comma=decimal).
- For Turkish invoices, TL means TRY.

OTHER RULES:
- Do not guess missing values; use null when not clearly present.
- currency must be TRY, USD, EUR, or null.
- purchaseDate must be YYYY-MM-DD, YYYY-MM, or null.
- confidence: 0.0–1.0 reflecting how certain you are.
- reason: one sentence explaining your category decision.

Return exactly this JSON structure:
{
  "totalAmount": null,
  "currency": null,
  "purchaseDate": null,
  "category": "shopping",
  "confidence": 0,
  "reason": ""
}

OCR_TEXT:
${String(ocrText).slice(0, 4000)}`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[parseOcrWithGroq] Groq API error:', response.status, errText);
            return res.status(502).json({ message: 'Groq API hatası.' });
        }

        const groqData = await response.json();
        const rawContent = groqData.choices?.[0]?.message?.content || '{}';

        let parsed;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            console.error('[parseOcrWithGroq] JSON parse error:', rawContent);
            return res.status(502).json({ message: 'Groq geçersiz JSON döndürdü.' });
        }

        // normalizeCategory maps any AI output (e.g. 'electricity') to canonical; fallback 'shopping' for receipts.
        const rawCat = normalizeCategory(parsed.category);
        const category = isCanonical(rawCat) ? rawCat : 'shopping';

        const rawAmount = parsed.totalAmount;
        const totalAmount = typeof rawAmount === 'number' && Number.isFinite(rawAmount) && rawAmount > 0
            ? rawAmount
            : null;

        const allowedCurrencies = ['TRY', 'USD', 'EUR'];
        const currency = allowedCurrencies.includes(parsed.currency) ? parsed.currency : null;

        const dateStr = String(parsed.purchaseDate || '');
        const purchaseDate = /^\d{4}-\d{2}(-\d{2})?$/.test(dateStr) ? dateStr : null;

        const confidence = typeof parsed.confidence === 'number'
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0;

        return res.status(200).json({
            success: true,
            data: { totalAmount, currency, purchaseDate, category, confidence, reason: String(parsed.reason || '') },
        });
    } catch (err) {
        console.error('[parseOcrWithGroq]', err.message);
        return res.status(500).json({ message: err.message || 'Groq OCR ayrıştırma başarısız oldu.' });
    }
};

// --- TÜMÜNÜ GETİR (GET ALL) ---
// GET /api/emissions
// Giriş yapmış kullanıcının tüm emisyon kayıtlarını döndürür (en yeni en başta).
const getAll = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, source, amount, date, category, activity_type, created_at
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
    const { source: rawSource, amount, date, category, activity_type } = req.body;
    const source = typeof rawSource === 'string' ? rawSource.trim() : '';

    if (!source || amount === undefined || !date) {
        return res.status(400).json({ message: 'Kaynak (source), miktar (amount) ve tarih (date) gereklidir.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Miktar pozitif bir sayı olmalıdır.' });
    }

    const rawCatInput = typeof category === 'string' ? category.trim() : '';
    const cat = rawCatInput ? normalizeCategory(rawCatInput) : null;
    const actType = typeof activity_type === 'string' && activity_type.trim() ? activity_type.trim() : null;

    try {
        const result = await pool.query(
            `INSERT INTO emission_records (user_id, source, amount, date, category, activity_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, source, amount, date, category, activity_type, created_at`,
            [req.user.id, source, parsedAmount, date, cat, actType]
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

// --- TEK KAYIT GETİR (GET BY ID) ---
// GET /api/emissions/:id
const getById = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `SELECT id, source, amount, date, category, activity_type, created_at
             FROM emission_records WHERE id = $1 AND user_id = $2`,
            [id, req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Kayıt bulunamadı.' });
        }
        return res.status(200).json({ record: result.rows[0] });
    } catch (err) {
        console.error('[emissions.getById]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

// --- GÜNCELLE (UPDATE) ---
// PUT /api/emissions/:id
const update = async (req, res) => {
    const { id } = req.params;
    const { source: rawSource, amount, date, category, activity_type } = req.body;
    const source = typeof rawSource === 'string' ? rawSource.trim() : '';

    if (!source || amount === undefined || !date) {
        return res.status(400).json({ message: 'Kaynak (source), miktar (amount) ve tarih (date) gereklidir.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Miktar pozitif bir sayı olmalıdır.' });
    }

    const rawCatInput = typeof category === 'string' ? category.trim() : '';
    const cat = rawCatInput ? normalizeCategory(rawCatInput) : null;
    const actType = typeof activity_type === 'string' && activity_type.trim() ? activity_type.trim() : null;

    try {
        const result = await pool.query(
            `UPDATE emission_records
             SET source = $1, amount = $2, date = $3, category = $4, activity_type = $5
             WHERE id = $6 AND user_id = $7
             RETURNING id, source, amount, date, category, activity_type, created_at`,
            [source, parsedAmount, date, cat, actType, id, req.user.id]
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

// --- SİMÜLASYON YOL HARİTASI (ROADMAP) ---
// POST /api/emissions/simulation-roadmap
const getSimulationRoadmap = async (req, res) => {
    const role = req.user.role;
    const { reductions } = req.body;

    try {
        if (!reductions) {
            return res.status(400).json({ message: 'Azaltım verileri (reductions) gereklidir.' });
        }

        const roadmap = await aiService.generateSimulationRoadmap(reductions, role);
        gamService.awardXp(req.user.id, 'what_if_simulation_used').catch(() => {});
        return res.status(200).json(roadmap);
    } catch (err) {
        console.error('[emissions.getSimulationRoadmap]', err.message);
        return res.status(500).json({ message: 'Yol haritası şu an hazırlanamıyor.' });
    }
};

module.exports = { getAll, getById, create, update, remove, calculate, generateInsight, extractOcrBillData, extractOcrFromImage, getSmartInsights, parseOcrWithGroq, getSimulationRoadmap };
