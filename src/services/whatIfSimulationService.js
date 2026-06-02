const pool             = require('../config/db');
const { isCanonical, getCategoryLabel } = require('../utils/categoryNormalizer');

const PERIOD_LABELS = {
    monthly:  'Bu Ay',
    yearly:   'Bu Yıl',
    all_time: 'Tüm Zamanlar',
};

const VALID_PERIODS = Object.keys(PERIOD_LABELS);

const simulate = async (userId, { category, reductionPercent, period }) => {
    if (category !== 'all' && !isCanonical(category)) {
        const err = new Error('Geçersiz kategori seçimi.'); err.status = 400; throw err;
    }

    const pct = Number(reductionPercent);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
        const err = new Error('Azaltma oranı 1 ile 100 arasında olmalıdır.'); err.status = 400; throw err;
    }

    if (!VALID_PERIODS.includes(period)) {
        const err = new Error('Geçersiz dönem seçimi.'); err.status = 400; throw err;
    }

    const params = [userId];
    let query = `
        SELECT COALESCE(SUM(amount), 0)::float AS total
        FROM emission_records
        WHERE user_id = $1
    `;

    const catFilter = category === 'all' ? null : [category];
    if (catFilter !== null) {
        params.push(catFilter);
        query += ` AND LOWER(category) = ANY($${params.length}::text[])`;
    }

    if (period === 'monthly') {
        query += ` AND DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'yearly') {
        query += ` AND DATE_TRUNC('year', date) = DATE_TRUNC('year', CURRENT_DATE)`;
    }

    const result = await pool.query(query, params);
    const currentEmission = parseFloat(result.rows[0]?.total ?? 0);

    if (currentEmission === 0) {
        return { simulationAvailable: false, message: 'Seçilen kategori ve dönem için emisyon kaydı bulunamadı.' };
    }

    const reducedAmount     = parseFloat((currentEmission * (pct / 100)).toFixed(2));
    const simulatedEmission = parseFloat((currentEmission - reducedAmount).toFixed(2));
    const periodLabel       = PERIOD_LABELS[period];
    const categoryLabel     = category === 'all' ? 'Tüm Kategoriler' : getCategoryLabel(category);
    const message = `${categoryLabel} tüketiminizi %${pct} azaltırsanız ${periodLabel} döneminde yaklaşık ${reducedAmount.toFixed(2)} kgCO₂e azaltım sağlayabilirsiniz.`;

    return {
        simulationAvailable: true,
        category,
        categoryLabel,
        period,
        periodLabel,
        currentEmission:  parseFloat(currentEmission.toFixed(2)),
        reductionPercent: pct,
        reducedAmount,
        simulatedEmission,
        message,
    };
};

module.exports = { simulate, VALID_PERIODS };
