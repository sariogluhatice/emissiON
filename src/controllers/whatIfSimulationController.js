const pool = require('../config/db');
const { isCanonical, getCategoryLabel } = require('../utils/categoryNormalizer');

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
    if (category !== 'all' && !isCanonical(category)) {
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
        const catFilter = category === 'all' ? null : [category];
        if (catFilter !== null) {
            params.push(catFilter);
            query += ` AND LOWER(category) = ANY($${params.length}::text[])`;
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

        const categoryLabel = category === 'all' ? 'Tüm Kategoriler' : getCategoryLabel(category);
        const message = `${categoryLabel} tüketiminizi %${pct} azaltırsanız ${periodLabel} döneminde yaklaşık ${reducedAmount.toFixed(2)} kgCO₂e azaltım sağlayabilirsiniz.`;

        return res.status(200).json({
            success:             true,
            simulationAvailable: true,
            category,
            categoryLabel,
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
