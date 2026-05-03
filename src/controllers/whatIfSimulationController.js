const pool = require('../config/db');

// Kategori → veritabanı source değerleri eşlemesi
const CATEGORY_MAP = {
    electricity: {
        label:   'Elektrik',
        sources: ['electricity'],
    },
    natural_gas: {
        label:   'Doğalgaz',
        sources: ['natural_gas'],
    },
    transport: {
        label:   'Ulaşım (Kara)',
        sources: ['car_petrol', 'car_diesel', 'bus', 'train'],
    },
    flight: {
        label:   'Uçuş',
        sources: ['flight_short', 'flight_long'],
    },
    water: {
        label:   'Su',
        sources: ['water_usage'],
    },
    food: {
        label:   'Gıda',
        sources: ['food_general', 'meat'],
    },
    shopping: {
        label:   'Alışveriş',
        sources: ['office_supplies', 'electronics', 'shopping_general', 'shopping'],
    },
    waste: {
        label:   'Atık & Malzeme',
        sources: ['waste_general', 'recycling', 'plastic', 'paper'],
    },
    all: {
        label:   'Tüm Kategoriler',
        sources: null, // null → filtre yok
    },
};

const VALID_CATEGORIES = Object.keys(CATEGORY_MAP);

const PERIOD_LABELS = {
    monthly:  'Bu Ay',
    yearly:   'Bu Yıl',
    all_time: 'Tüm Zamanlar',
};

const VALID_PERIODS = Object.keys(PERIOD_LABELS);

// POST /api/what-if-simulation
const simulate = async (req, res) => {
    const userId = req.user.id;
    const { category, reductionPercent, period } = req.body;

    // ── Girdi doğrulaması ─────────────────────────────────────────────────────
    if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({
            success: false,
            message: 'Geçersiz kategori seçimi.',
        });
    }

    const pct = Number(reductionPercent);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
        return res.status(400).json({
            success: false,
            message: 'Azaltma oranı 1 ile 100 arasında olmalıdır.',
        });
    }

    if (!VALID_PERIODS.includes(period)) {
        return res.status(400).json({
            success: false,
            message: 'Geçersiz dönem seçimi.',
        });
    }

    try {
        // ── SQL sorgusu oluştur ────────────────────────────────────────────────
        const params = [userId];
        let query = `
            SELECT COALESCE(SUM(amount), 0)::float AS total
            FROM emission_records
            WHERE user_id = $1
        `;

        // Kategori filtresi (all → tüm kayıtlar)
        const catInfo = CATEGORY_MAP[category];
        if (catInfo.sources !== null) {
            params.push(catInfo.sources);
            query += ` AND LOWER(source) = ANY($${params.length}::text[])`;
        }

        // Dönem filtresi
        if (period === 'monthly') {
            query += ` AND DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)`;
        } else if (period === 'yearly') {
            query += ` AND DATE_TRUNC('year', date) = DATE_TRUNC('year', CURRENT_DATE)`;
        }
        // all_time → tarih filtresi yok

        const result = await pool.query(query, params);
        const currentEmission = parseFloat(result.rows[0]?.total ?? 0);

        // Seçilen filtre için kayıt yoksa
        if (currentEmission === 0) {
            return res.status(200).json({
                success:              true,
                simulationAvailable:  false,
                message:              'Seçilen kategori ve dönem için emisyon kaydı bulunamadı.',
            });
        }

        // ── Hesaplama ─────────────────────────────────────────────────────────
        const reducedAmount      = parseFloat((currentEmission * (pct / 100)).toFixed(2));
        const simulatedEmission  = parseFloat((currentEmission - reducedAmount).toFixed(2));
        const periodLabel        = PERIOD_LABELS[period];

        const message = `${catInfo.label} tüketiminizi %${pct} azaltırsanız ${periodLabel} döneminde yaklaşık ${reducedAmount.toFixed(2)} kgCO₂e azaltım sağlayabilirsiniz.`;

        return res.status(200).json({
            success:             true,
            simulationAvailable: true,
            category,
            categoryLabel:       catInfo.label,
            period,
            periodLabel,
            currentEmission:     parseFloat(currentEmission.toFixed(2)),
            reductionPercent:    pct,
            reducedAmount,
            simulatedEmission,
            message,
        });

    } catch (err) {
        console.error('[whatIfSimulation]', err.message);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası.',
        });
    }
};

module.exports = { simulate };
