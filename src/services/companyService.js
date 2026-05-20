const pool = require('../config/db');
const tp   = require('../utils/taskProgress');

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const _fail = (status, message) => {
    const err = new Error(message);
    err.status = status;
    throw err;
};

// Valid CBAM sector keys — used to validate cbam_entries.export_category.
const CBAM_SECTORS = [
    'iron_steel',
    'aluminium',
    'cement',
    'fertiliser',
    'hydrogen',
    'electricity',
    'other',
];

// Turkish display labels used as the `source` field in emission_records
// created by CBAM declarations so they render correctly in Emisyon Takibi.
const CBAM_EMISSION_SOURCES = {
    iron_steel:  'CBAM Demir/Çelik İhracatı',
    aluminium:   'CBAM Alüminyum İhracatı',
    cement:      'CBAM Çimento İhracatı',
    fertiliser:  'CBAM Gübre İhracatı',
    hydrogen:    'CBAM Hidrojen İhracatı',
    electricity: 'CBAM Elektrik İhracatı',
    other:       'CBAM Diğer İhracat',
};

// emission_records category values (from add-entry form) — used for task tracking.
const EMISSION_CATEGORIES = [
    'energy', 'water', 'gas', 'transport', 'materials', 'waste', 'food', 'shopping', 'other',
];

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG CACHE — 5-minute in-memory TTL
// Admin changes are reflected within one cache window; avoids a DB round-trip
// on every createCbamEntry / getDashboard call.
// ─────────────────────────────────────────────────────────────────────────────

let _configCache    = null;
let _configCacheAt  = 0;
const CONFIG_TTL_MS = 5 * 60 * 1000;

const _getConfig = async () => {
    const now = Date.now();
    if (_configCache && now - _configCacheAt < CONFIG_TTL_MS) return _configCache;

    const { rows } = await pool.query(
        'SELECT config_key, config_value FROM admin_cbam_config'
    );
    const cfg = {};
    rows.forEach(r => { cfg[r.config_key] = parseFloat(r.config_value); });
    _configCache = {
        carbon_price_default:    cfg.carbon_price_default    ?? 65,
        risk_threshold_medium:   cfg.risk_threshold_medium   ?? 10000,
        risk_threshold_high:     cfg.risk_threshold_high     ?? 50000,
        risk_threshold_critical: cfg.risk_threshold_critical ?? 200000,
    };
    _configCacheAt = now;
    return _configCache;
};

// ─────────────────────────────────────────────────────────────────────────────
// RISK LEVEL COMPUTATION  (pure — no DB)
// ─────────────────────────────────────────────────────────────────────────────

const _computeRiskLevel = (cbamCost, config) => {
    if (cbamCost < config.risk_threshold_medium)   return 'low';
    if (cbamCost < config.risk_threshold_high)     return 'medium';
    if (cbamCost < config.risk_threshold_critical) return 'high';
    return 'critical';
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET COMPANY PROFILE
// ─────────────────────────────────────────────────────────────────────────────

const getCompanyProfile = async (userId) => {
    const { rows } = await pool.query(
        'SELECT * FROM company_profiles WHERE user_id = $1',
        [userId]
    );
    return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. UPSERT COMPANY PROFILE
// ─────────────────────────────────────────────────────────────────────────────

const upsertCompanyProfile = async (userId, {
    company_name,
    cbam_sector,
    exports_to_eu,
    annual_production,
    country,
    default_carbon_price,
}) => {
    const cleanSector = cbam_sector ?? null;
    if (cleanSector !== null && !CBAM_SECTORS.includes(cleanSector)) {
        _fail(400, `Geçersiz CBAM sektörü. Geçerli değerler: ${CBAM_SECTORS.join(', ')}.`);
    }

    const cleanPrice = default_carbon_price != null ? parseFloat(default_carbon_price) : null;
    if (cleanPrice !== null && (isNaN(cleanPrice) || cleanPrice < 0)) {
        _fail(400, 'Varsayılan karbon fiyatı sıfır veya pozitif bir sayı olmalıdır.');
    }

    const cleanProduction = annual_production != null ? parseFloat(annual_production) : null;
    if (cleanProduction !== null && (isNaN(cleanProduction) || cleanProduction <= 0)) {
        _fail(400, 'Yıllık üretim miktarı pozitif bir sayı olmalıdır.');
    }

    const { rows: [profile] } = await pool.query(
        `INSERT INTO company_profiles
             (user_id, company_name, cbam_sector, exports_to_eu, annual_production,
              country, default_carbon_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET
             company_name          = COALESCE(EXCLUDED.company_name,         company_profiles.company_name),
             cbam_sector           = EXCLUDED.cbam_sector,
             exports_to_eu         = EXCLUDED.exports_to_eu,
             annual_production     = EXCLUDED.annual_production,
             country               = EXCLUDED.country,
             default_carbon_price  = EXCLUDED.default_carbon_price
         RETURNING *`,
        [
            userId,
            company_name  ?? null,
            cleanSector,
            exports_to_eu ?? false,
            cleanProduction,
            country       ?? null,
            cleanPrice,
        ]
    );
    return profile;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. CBAM SUMMARY  (primary — derived from emission_records)
// ─────────────────────────────────────────────────────────────────────────────

const getCbamSummary = async (userId) => {
    const [emissionRes, trendRes, categoryRes, config] = await Promise.all([
        pool.query(
            `SELECT COALESCE(SUM(amount), 0)::float AS total_kg,
                    COUNT(*)::int AS record_count
             FROM emission_records WHERE user_id = $1`,
            [userId]
        ),
        pool.query(
            `SELECT TO_CHAR(date, 'YYYY-MM') AS period,
                    COALESCE(SUM(amount), 0)::float AS total_kg
             FROM emission_records WHERE user_id = $1
             GROUP BY TO_CHAR(date, 'YYYY-MM')
             ORDER BY TO_CHAR(date, 'YYYY-MM') DESC
             LIMIT 6`,
            [userId]
        ),
        pool.query(
            `SELECT COALESCE(category, 'other') AS category,
                    COALESCE(SUM(amount), 0)::float AS total_kg,
                    COUNT(*)::int AS cnt
             FROM emission_records WHERE user_id = $1
             GROUP BY COALESCE(category, 'other')
             ORDER BY total_kg DESC`,
            [userId]
        ),
        _getConfig(),
    ]);

    const totalKg       = parseFloat(emissionRes.rows[0].total_kg);
    const recordCount   = emissionRes.rows[0].record_count;
    const totalTco2     = totalKg / 1000;
    const carbonPrice   = config.carbon_price_default;
    const estimatedTax  = parseFloat((totalTco2 * carbonPrice).toFixed(2));
    const riskLevel     = _computeRiskLevel(estimatedTax, config);

    const trend = [...trendRes.rows].reverse().map(r => ({
        period:        r.period,
        total_kg:      parseFloat(r.total_kg),
        total_tco2:    parseFloat((r.total_kg / 1000).toFixed(4)),
        estimated_tax: parseFloat((r.total_kg / 1000 * carbonPrice).toFixed(2)),
    }));

    const categories = categoryRes.rows.map(r => ({
        category:      r.category,
        total_kg:      parseFloat(r.total_kg),
        total_tco2:    parseFloat((r.total_kg / 1000).toFixed(4)),
        estimated_tax: parseFloat((r.total_kg / 1000 * carbonPrice).toFixed(2)),
        cnt:           r.cnt,
        share_pct:     totalKg > 0
            ? parseFloat((r.total_kg / totalKg * 100).toFixed(1))
            : 0,
    }));

    return {
        total_kg:          totalKg,
        total_tco2:        parseFloat(totalTco2.toFixed(4)),
        record_count:      recordCount,
        estimated_tax:     estimatedTax,
        carbon_price_used: carbonPrice,
        risk_level:        riskLevel,
        has_records:       recordCount > 0,
        trend,
        categories,
        top_category:      categories[0] ?? null,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4a. CBAM DEFAULT EMISSION FACTORS  (EU standard tCO₂/ton, 2024 baseline)
// ─────────────────────────────────────────────────────────────────────────────

const CBAM_DEFAULT_FACTORS = {
    iron_steel:  1.85,
    aluminium:   6.70,
    cement:      0.83,
    fertiliser:  1.60,
    hydrogen:    10.00,
    electricity: 0.50,
};

const getCbamDefaultFactor = (category) => {
    const factor = CBAM_DEFAULT_FACTORS[category] ?? null;
    return { category, factor, source: factor !== null ? 'eu_standard' : 'none' };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. PERIOD EMISSIONS LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

const getPeriodEmissions = async (userId, periodStr) => {
    const [emRes, profile, config] = await Promise.all([
        pool.query(
            `SELECT COALESCE(SUM(amount), 0)::float AS total_kg
             FROM emission_records
             WHERE user_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2`,
            [userId, periodStr]
        ),
        getCompanyProfile(userId),
        _getConfig(),
    ]);

    const totalKg         = parseFloat(emRes.rows[0].total_kg);
    const annualProd      = profile?.annual_production ? parseFloat(profile.annual_production) : null;
    const monthlyProdTons = annualProd ? annualProd / 12 : null;

    return {
        period:               periodStr,
        total_kg:             totalKg,
        monthly_prod_tons:    monthlyProdTons,
        carbon_price_default: config.carbon_price_default,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. CREATE CBAM ENTRY
// ─────────────────────────────────────────────────────────────────────────────

const createCbamEntry = async (userId, {
    product_name,
    export_category,
    export_amount,
    emission_factor,
    carbon_price,
    paid_carbon_price,
    period_start,
    period_end,
    destination_region,
    notes,
}) => {
    if (!CBAM_SECTORS.includes(export_category)) {
        _fail(400, 'Geçersiz ihracat kategorisi.');
    }

    const amount    = parseFloat(export_amount);
    const paidPrice = parseFloat(paid_carbon_price) || 0;

    if (!Number.isFinite(amount) || amount <= 0)
        _fail(400, 'İhracat miktarı pozitif bir sayı olmalıdır.');
    if (!Number.isFinite(paidPrice) || paidPrice < 0)
        _fail(400, 'Ödenen karbon vergisi sıfır veya pozitif olmalıdır.');

    const config = await _getConfig();

    // ── Carbon price ──────────────────────────────────────────────────────────
    let finalPrice;
    const manualPrice = (carbon_price != null && carbon_price !== '')
        ? parseFloat(carbon_price) : null;
    if (manualPrice !== null) {
        if (!Number.isFinite(manualPrice) || manualPrice < 0)
            _fail(400, 'Karbon fiyatı sıfır veya pozitif bir sayı olmalıdır.');
        finalPrice = manualPrice;
    } else {
        finalPrice = config.carbon_price_default;
    }

    // ── Emission factor ───────────────────────────────────────────────────────
    let finalFactor;
    let sourceEmissionTotal  = null;
    let emissionFactorSource = 'manual';

    const manualFactor = (emission_factor != null && emission_factor !== '')
        ? parseFloat(emission_factor) : null;

    if (manualFactor !== null) {
        if (!Number.isFinite(manualFactor) || manualFactor <= 0)
            _fail(400, 'Emisyon faktörü pozitif bir sayı olmalıdır.');
        finalFactor = manualFactor;
    } else {
        const periodStr = period_start.slice(0, 7);
        const { rows: [emRow] } = await pool.query(
            `SELECT COALESCE(SUM(amount), 0)::float AS total_kg
             FROM emission_records
             WHERE user_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2`,
            [userId, periodStr]
        );
        const totalKg = parseFloat(emRow.total_kg);

        if (totalKg <= 0) {
            _fail(400, `Otomatik hesaplama için ${periodStr} döneminde emisyon kaydı bulunamadı. Lütfen emisyon faktörünü manuel girin.`);
        }

        sourceEmissionTotal = parseFloat(totalKg.toFixed(4));
        const profile     = await getCompanyProfile(userId);
        const annualProd  = profile?.annual_production ? parseFloat(profile.annual_production) : null;
        const denominator = annualProd ? annualProd / 12 : amount;

        finalFactor = parseFloat((totalKg / 1000 / denominator).toFixed(6));

        if (!Number.isFinite(finalFactor) || finalFactor <= 0)
            _fail(400, 'Emisyon faktörü hesaplanamadı. Profilden yıllık üretim miktarı girin veya faktörü manuel olarak sağlayın.');

        emissionFactorSource = 'auto';
    }

    // ── CBAM formula ──────────────────────────────────────────────────────────
    const totalEmbeddedEmission = parseFloat((amount * finalFactor).toFixed(4));
    const netPrice              = Math.max(0, finalPrice - paidPrice);
    const estimatedCbamCost     = parseFloat((totalEmbeddedEmission * netPrice).toFixed(2));
    const riskLevel             = _computeRiskLevel(estimatedCbamCost, config);

    // Warn when paid price exceeds carbon price — net becomes 0 but may be unintentional
    let warning = null;
    if (paidPrice > finalPrice) {
        warning = `Ödenen karbon fiyatı (€${paidPrice.toFixed(2)}) AB ETS fiyatından (€${finalPrice.toFixed(2)}) yüksek. Net CBAM yükümlülüğü 0 olarak hesaplanmıştır.`;
    }

    const dbClient = await pool.connect();
    try {
        await dbClient.query('BEGIN');

        const { rows: [emRecord] } = await dbClient.query(
            `INSERT INTO emission_records (user_id, source, amount, date, category)
             VALUES ($1, $2, $3, $4, 'other')
             RETURNING id`,
            [
                userId,
                CBAM_EMISSION_SOURCES[export_category] || 'CBAM İhracat',
                parseFloat((totalEmbeddedEmission * 1000).toFixed(2)),
                period_start,
            ]
        );

        const { rows: [entry] } = await dbClient.query(
            `INSERT INTO cbam_entries
                 (user_id, product_name, export_category, export_amount, emission_factor,
                  carbon_price, paid_carbon_price, period_start, period_end,
                  total_embedded_emission, estimated_cbam_cost, risk_level,
                  destination_region, source_emission_total, emission_factor_source, notes,
                  emission_record_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             RETURNING *`,
            [
                userId,
                typeof product_name === 'string' ? product_name.trim() || null : null,
                export_category,
                amount,
                finalFactor,
                finalPrice,
                paidPrice,
                period_start,
                period_end || null,
                totalEmbeddedEmission,
                estimatedCbamCost,
                riskLevel,
                typeof destination_region === 'string' ? destination_region.trim() || null : null,
                sourceEmissionTotal,
                emissionFactorSource,
                typeof notes === 'string' ? notes.trim() || null : null,
                emRecord.id,
            ]
        );

        await dbClient.query('COMMIT');
        return { ...entry, warning };
    } catch (err) {
        await dbClient.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        dbClient.release();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. UPDATE CBAM ENTRY  (PATCH — mutable fields only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates the editable fields of an existing CBAM entry.
 * Immutable computed fields (total_embedded_emission, emission_factor) are
 * preserved.  Re-computes estimated_cbam_cost and risk_level when
 * paid_carbon_price changes.
 */
const updateCbamEntry = async (userId, entryId, {
    product_name,
    notes,
    destination_region,
    period_end,
    paid_carbon_price,
}) => {
    const { rows: [existing] } = await pool.query(
        'SELECT * FROM cbam_entries WHERE id = $1 AND user_id = $2',
        [entryId, userId]
    );
    if (!existing) _fail(404, 'Kayıt bulunamadı.');

    const newPaid = paid_carbon_price != null
        ? parseFloat(paid_carbon_price)
        : parseFloat(existing.paid_carbon_price);

    if (!Number.isFinite(newPaid) || newPaid < 0)
        _fail(400, 'Ödenen karbon vergisi sıfır veya pozitif olmalıdır.');

    const carbonPrice  = parseFloat(existing.carbon_price);
    const netPrice     = Math.max(0, carbonPrice - newPaid);
    const newCbamCost  = parseFloat((parseFloat(existing.total_embedded_emission) * netPrice).toFixed(2));
    const config       = await _getConfig();
    const newRisk      = _computeRiskLevel(newCbamCost, config);

    let warning = null;
    if (newPaid > carbonPrice) {
        warning = `Ödenen karbon fiyatı (€${newPaid.toFixed(2)}) AB ETS fiyatından (€${carbonPrice.toFixed(2)}) yüksek. Net CBAM yükümlülüğü 0 olarak hesaplanmıştır.`;
    }

    const val = (v, fallback) =>
        v !== undefined
            ? (typeof v === 'string' ? v.trim() || null : v ?? null)
            : fallback;

    const { rows: [entry] } = await pool.query(
        `UPDATE cbam_entries
         SET product_name        = $1,
             notes               = $2,
             destination_region  = $3,
             period_end          = $4,
             paid_carbon_price   = $5,
             estimated_cbam_cost = $6,
             risk_level          = $7
         WHERE id = $8 AND user_id = $9
         RETURNING *`,
        [
            val(product_name,      existing.product_name),
            val(notes,             existing.notes),
            val(destination_region, existing.destination_region),
            period_end !== undefined ? (period_end || null) : existing.period_end,
            newPaid,
            newCbamCost,
            newRisk,
            entryId,
            userId,
        ]
    );

    return { ...entry, warning };
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET CBAM ENTRIES  (paginated)
// ─────────────────────────────────────────────────────────────────────────────

const getCbamEntries = async (userId, { page = 1, limit = 20 } = {}) => {
    const safeLimit  = Math.min(Math.max(parseInt(limit,  10) || 20, 1), 100);
    const safePage   = Math.max(parseInt(page, 10) || 1, 1);
    const offset     = (safePage - 1) * safeLimit;

    const [entriesRes, countRes] = await Promise.all([
        pool.query(
            `SELECT * FROM cbam_entries WHERE user_id = $1
             ORDER BY period_start DESC, created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, safeLimit, offset]
        ),
        pool.query(
            'SELECT COUNT(*)::int AS total FROM cbam_entries WHERE user_id = $1',
            [userId]
        ),
    ]);

    return {
        entries: entriesRes.rows,
        total:   countRes.rows[0].total,
        page:    safePage,
        limit:   safeLimit,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. DELETE CBAM ENTRY
// ─────────────────────────────────────────────────────────────────────────────

const deleteCbamEntry = async (userId, entryId) => {
    const dbClient = await pool.connect();
    try {
        await dbClient.query('BEGIN');

        const { rows } = await dbClient.query(
            `DELETE FROM cbam_entries WHERE id = $1 AND user_id = $2 RETURNING id, emission_record_id`,
            [entryId, userId]
        );

        if (rows.length === 0) {
            const err = new Error('Kayıt bulunamadı.');
            err.status = 404;
            throw err;
        }

        const { emission_record_id } = rows[0];
        if (emission_record_id) {
            await dbClient.query(
                `DELETE FROM emission_records WHERE id = $1 AND user_id = $2`,
                [emission_record_id, userId]
            );
        }

        await dbClient.query('COMMIT');
        return rows[0];
    } catch (err) {
        await dbClient.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        dbClient.release();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. COMPANY TASKS
// ─────────────────────────────────────────────────────────────────────────────

const createCompanyTask = async (userId, {
    title,
    description,
    emission_category,
    target_reduction_pct,
    due_date,
}) => {
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    if (!cleanTitle) _fail(400, 'Görev başlığı gereklidir.');

    const cleanCategory = typeof emission_category === 'string' && emission_category.trim()
        ? emission_category.trim() : null;

    if (cleanCategory && !EMISSION_CATEGORIES.includes(cleanCategory)) {
        _fail(400, `Geçersiz emisyon kategorisi. Geçerli değerler: ${EMISSION_CATEGORIES.join(', ')}.`);
    }

    const cleanPct = target_reduction_pct != null ? parseFloat(target_reduction_pct) : null;

    if ((cleanCategory && cleanPct === null) || (!cleanCategory && cleanPct !== null)) {
        _fail(400, 'Emisyon kategorisi ve azaltım hedefi birlikte girilmelidir.');
    }
    if (cleanPct !== null && (isNaN(cleanPct) || cleanPct <= 0 || cleanPct >= 100)) {
        _fail(400, 'Azaltım hedefi 1 ile 99 arasında olmalıdır.');
    }

    let baselineEmission        = null;
    let targetEmission          = null;
    let baselinePeriodVal       = null;
    let baselineDaysVal         = null;
    let periodTargetEmissionVal = null;
    const taskStartDate         = new Date().toISOString().split('T')[0];

    if (cleanCategory && cleanPct !== null) {
        // Prefer months strictly before the task start month; fall back to any month.
        const startMonth = taskStartDate.slice(0, 7);
        const { rows: [bRow] } = await pool.query(
            `SELECT SUM(amount)::float AS baseline_kg,
                    TO_CHAR(date, 'YYYY-MM') AS period
             FROM emission_records
             WHERE user_id = $1 AND COALESCE(category, 'other') = $2
             GROUP BY TO_CHAR(date, 'YYYY-MM')
             HAVING SUM(amount) > 0
             ORDER BY
                 CASE WHEN TO_CHAR(date, 'YYYY-MM') < $3 THEN 0 ELSE 1 END,
                 TO_CHAR(date, 'YYYY-MM') DESC
             LIMIT 1`,
            [userId, cleanCategory, startMonth]
        );
        const rawKg = parseFloat(bRow?.baseline_kg ?? 0);
        if (rawKg > 0) {
            const rawTco2    = rawKg / 1000;
            baselineEmission = parseFloat(rawTco2.toFixed(4));
            targetEmission   = parseFloat((rawTco2 * (1 - cleanPct / 100)).toFixed(4));
            baselinePeriodVal = bRow.period;
            const { baselineDays, periodTarget } = tp.calcPeriodTarget(
                rawTco2, bRow.period, cleanPct, taskStartDate, due_date || null
            );
            baselineDaysVal         = baselineDays;
            periodTargetEmissionVal = periodTarget;
        }
    }

    const { rows: [task] } = await pool.query(
        `INSERT INTO company_tasks
             (user_id, title, description, emission_category, target_reduction_pct,
              baseline_emission, target_emission, due_date,
              start_date, baseline_period, baseline_days, period_target_emission)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
            userId,
            cleanTitle,
            typeof description === 'string' ? description.trim() || null : null,
            cleanCategory,
            cleanPct,
            baselineEmission,
            targetEmission,
            due_date || null,
            taskStartDate,
            baselinePeriodVal,
            baselineDaysVal,
            periodTargetEmissionVal,
        ]
    );
    return task;
};

const _addProgressToCompanyTasks = async (tasks, userId) => {
    const trackingTasks = tasks.filter(t => t.emission_category);
    if (!trackingTasks.length) return tasks;

    // ── Step 0: Retroactively resolve missing period_target_emission ─────────
    const noTargetTasks = trackingTasks.filter(
        t => t.target_reduction_pct && (t.period_target_emission == null || t.baseline_period == null)
    );
    if (noTargetTasks.length) {
        await Promise.all(noTargetTasks.map(async t => {
            const tStartMonth = tp.toDateStr(t.start_date || t.created_at).slice(0, 7);
            const { rows } = await pool.query(
                `SELECT SUM(amount)::float AS baseline_kg,
                        TO_CHAR(date, 'YYYY-MM') AS period
                 FROM emission_records
                 WHERE user_id = $1 AND COALESCE(category, 'other') = $2
                 GROUP BY TO_CHAR(date, 'YYYY-MM')
                 HAVING SUM(amount) > 0
                 ORDER BY
                     CASE WHEN TO_CHAR(date, 'YYYY-MM') < $3 THEN 0 ELSE 1 END,
                     TO_CHAR(date, 'YYYY-MM') DESC
                 LIMIT 1`,
                [userId, t.emission_category, tStartMonth]
            );
            if (rows.length && parseFloat(rows[0].baseline_kg) > 0) {
                const rawTco2  = parseFloat(rows[0].baseline_kg) / 1000;
                const period   = rows[0].period;
                const pct      = parseFloat(t.target_reduction_pct);
                const startStr = tp.toDateStr(t.start_date || t.created_at);
                const { baselineDays, periodTarget } = tp.calcPeriodTarget(
                    rawTco2, period, pct, startStr, tp.toDateStr(t.due_date)
                );
                await pool.query(
                    `UPDATE company_tasks
                     SET baseline_emission = $1, baseline_period = $2,
                         baseline_days = $3, period_target_emission = $4
                     WHERE id = $5`,
                    [rawTco2, period, baselineDays, periodTarget, t.id]
                );
                t.baseline_emission       = rawTco2;
                t.baseline_period         = period;
                t.baseline_days           = baselineDays;
                t.period_target_emission  = periodTarget;
            }
        }));
    }

    // ── Step 1: Current emissions per task (start_date → min(due_date, today)) ─
    const taskIds = trackingTasks.map(t => t.id);
    const { rows: emRows } = await pool.query(
        `SELECT
            ct.id                                        AS task_id,
            COALESCE(SUM(er.amount), 0)::float / 1000   AS current_tco2
         FROM company_tasks ct
         JOIN emission_records er
             ON er.user_id = $1
            AND COALESCE(er.category, 'other') = ct.emission_category
            AND er.date >= COALESCE(ct.start_date, ct.created_at::date)
            AND er.date <= LEAST(COALESCE(ct.due_date, CURRENT_DATE), CURRENT_DATE)
         WHERE ct.id = ANY($2)
         GROUP BY ct.id`,
        [userId, taskIds]
    );

    const currentMap = {};
    emRows.forEach(r => { currentMap[r.task_id] = parseFloat(r.current_tco2); });

    const now      = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const progressById = {};
    trackingTasks.forEach(t => {
        const current = currentMap[t.id] ?? null;

        // Pending tasks: show data but don't compare against target yet
        if (t.status === 'pending') {
            progressById[t.id] = { current_emission: current, progress_status: 'not_started' };
            return;
        }

        if (t.baseline_emission == null) {
            progressById[t.id] = { current_emission: current, progress_status: 'no_baseline' };
            return;
        }

        const periodTarget = t.period_target_emission != null
            ? parseFloat(t.period_target_emission) : null;

        const dueStr         = tp.toDateStr(t.due_date);
        const deadlinePassed = dueStr && dueStr < todayStr;

        const progress_status = tp.calcProgressStatus(current, periodTarget, {
            deadlinePassed, isCompleted: t.status === 'completed',
        });

        progressById[t.id] = { current_emission: current, progress_status };
    });

    return tasks.map(t => ({ ...t, ...(progressById[t.id] || {}) }));
};

// Normalizes company task fields to match the household-tasks interface so the
// frontend can use the same rendering logic for both role types.
// Converts tCO₂ → kg CO₂e and renames columns to household equivalents.
const _normalizeCompanyTaskFields = (t) => {
    const toKg = (val) => val != null ? parseFloat((parseFloat(val) * 1000).toFixed(2)) : null;
    return {
        ...t,
        baseline_amount: toKg(t.baseline_emission),
        target_amount:   toKg(t.target_emission),
        period_target:   toKg(t.period_target_emission),
        current_amount:  toKg(t.current_emission),
        target_pct:      t.target_reduction_pct,
    };
};

const getCompanyTasks = async (userId) => {
    const { rows } = await pool.query(
        `SELECT * FROM company_tasks
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
    );

    // Auto-complete in_progress tasks whose due_date has passed
    const today      = new Date().toISOString().split('T')[0];
    const overdueIds = rows
        .filter(t => t.status === 'in_progress' && t.due_date && tp.toDateStr(t.due_date) < today)
        .map(t => t.id);
    if (overdueIds.length) {
        await pool.query(
            `UPDATE company_tasks SET status = 'completed', updated_at = NOW() WHERE id = ANY($1)`,
            [overdueIds]
        );
        rows.forEach(t => { if (overdueIds.includes(t.id)) t.status = 'completed'; });
    }

    const tasks = await _addProgressToCompanyTasks(rows, userId);
    return tasks.map(_normalizeCompanyTaskFields);
};

const updateCompanyTaskStatus = async (userId, taskId, status) => {
    const VALID = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!VALID.includes(status)) {
        _fail(400, `Geçersiz durum. İzin verilenler: ${VALID.join(', ')}.`);
    }

    const { rows } = await pool.query(
        `UPDATE company_tasks
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [status, taskId, userId]
    );
    if (rows.length === 0) _fail(404, 'Görev bulunamadı.');
    return rows[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compliance score factors (all bounded to [5, 100]):
 *   1. Risk penalty     — low:0, medium:−20, high:−45, critical:−75
 *   2. Data coverage    — <3 months: −10, <6 months: −5
 *   3. Task completion  — >75% done: +5; >50%: +2; <25% with ≥3 tasks: −5
 *   4. Paid-carbon decl — any paid_carbon_price > 0 entry present: +5
 */
const getDashboard = async (userId) => {
    const [emissionRes, trendRes, categoryRes, config, topEntryRes, taskStatsRes, paidDeclRes] = await Promise.all([
        pool.query(
            `SELECT COALESCE(SUM(amount), 0)::float AS total_kg,
                    COUNT(*)::int AS record_count
             FROM emission_records WHERE user_id = $1`,
            [userId]
        ),
        pool.query(
            `SELECT TO_CHAR(date, 'YYYY-MM') AS period,
                    COALESCE(SUM(amount), 0)::float AS total_kg
             FROM emission_records WHERE user_id = $1
             GROUP BY TO_CHAR(date, 'YYYY-MM')
             ORDER BY TO_CHAR(date, 'YYYY-MM') DESC
             LIMIT 6`,
            [userId]
        ),
        pool.query(
            `SELECT COALESCE(category, 'other') AS category,
                    COALESCE(SUM(amount), 0)::float AS total_kg,
                    COUNT(*)::int AS cnt
             FROM emission_records WHERE user_id = $1
             GROUP BY COALESCE(category, 'other')
             ORDER BY total_kg DESC`,
            [userId]
        ),
        _getConfig(),
        pool.query(
            `SELECT product_name, export_category, estimated_cbam_cost, risk_level, period_start
             FROM cbam_entries WHERE user_id = $1
             ORDER BY estimated_cbam_cost DESC LIMIT 1`,
            [userId]
        ),
        pool.query(
            `SELECT
                 COUNT(*)::int                                           AS total_tasks,
                 COUNT(*) FILTER (WHERE status = 'completed')::int      AS completed_tasks
             FROM company_tasks WHERE user_id = $1`,
            [userId]
        ),
        pool.query(
            `SELECT COUNT(*)::int AS cnt
             FROM cbam_entries WHERE user_id = $1 AND paid_carbon_price > 0`,
            [userId]
        ),
    ]);

    const totalKg     = parseFloat(emissionRes.rows[0].total_kg);
    const totalTco2   = totalKg / 1000;
    const carbonPrice = config.carbon_price_default;
    const estimatedTax = parseFloat((totalTco2 * carbonPrice).toFixed(2));
    const dominantRisk = _computeRiskLevel(estimatedTax, config);

    const riskCounts = { low: 0, medium: 0, high: 0, critical: 0 };
    if (riskCounts[dominantRisk] !== undefined) riskCounts[dominantRisk]++;

    // ── Compliance score: multi-factor ────────────────────────────────────────
    const RISK_PENALTY = { low: 0, medium: -20, high: -45, critical: -75 };
    let score = 100 + (RISK_PENALTY[dominantRisk] ?? 0);

    const monthsOfData  = trendRes.rows.length;
    if (monthsOfData < 3) score -= 10;
    else if (monthsOfData < 6) score -= 5;

    const totalTasks     = taskStatsRes.rows[0].total_tasks;
    const completedTasks = taskStatsRes.rows[0].completed_tasks;
    if (totalTasks > 0) {
        const completionRate = completedTasks / totalTasks;
        if      (completionRate >= 0.75)              score += 5;
        else if (completionRate >= 0.5)               score += 2;
        else if (completionRate < 0.25 && totalTasks >= 3) score -= 5;
    }

    if (paidDeclRes.rows[0].cnt > 0) score += 5;

    const complianceScore = Math.max(5, Math.min(100, Math.round(score)));

    const trend = [...trendRes.rows].reverse().map(r => ({
        period:    r.period,
        cbam_cost: parseFloat((r.total_kg / 1000 * carbonPrice).toFixed(2)),
        emission:  parseFloat((r.total_kg / 1000).toFixed(4)),
    }));

    const categories = categoryRes.rows.map(r => ({
        export_category: r.category,
        emission:        parseFloat((r.total_kg / 1000).toFixed(4)),
        cbam_cost:       parseFloat((r.total_kg / 1000 * carbonPrice).toFixed(2)),
        cnt:             r.cnt,
    }));

    return {
        total_emission:     parseFloat(totalTco2.toFixed(4)),
        total_cbam_cost:    estimatedTax,
        entry_count:        emissionRes.rows[0].record_count,
        dominant_risk:      dominantRisk,
        risk_counts:        riskCounts,
        compliance_score:   complianceScore,
        trend,
        categories,
        highest_risk_entry:  topEntryRes.rows[0] ?? null,
        top_emission_source: categories[0] ?? null,
        carbon_price_used:   carbonPrice,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. WHAT-IF SIMULATION
// ─────────────────────────────────────────────────────────────────────────────

const runSimulation = async (userId, {
    scenario_name,
    carbon_price,
    export_change_pct,
    emission_factor_change_pct,
    paid_price,
}) => {
    const { rows: [summary] } = await pool.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total_kg FROM emission_records WHERE user_id = $1`,
        [userId]
    );
    const baselineEmission = parseFloat(summary.total_kg) / 1000;

    const exportMult   = 1 + export_change_pct / 100;
    const factorMult   = 1 + emission_factor_change_pct / 100;
    const projEmission = parseFloat((baselineEmission * exportMult * factorMult).toFixed(4));
    const netPrice     = parseFloat(Math.max(0, carbon_price - paid_price).toFixed(2));
    const projCost     = parseFloat((projEmission * netPrice).toFixed(2));

    const emissionChangePct = baselineEmission > 0
        ? parseFloat(((projEmission - baselineEmission) / baselineEmission * 100).toFixed(2))
        : 0;

    const config   = await _getConfig();
    const projRisk = _computeRiskLevel(projCost, config);

    const cleanInputs = {
        carbon_price:               parseFloat(carbon_price.toFixed(2)),
        export_change_pct:          parseFloat(parseFloat(export_change_pct).toFixed(2)),
        emission_factor_change_pct: parseFloat(parseFloat(emission_factor_change_pct).toFixed(2)),
        paid_price:                 parseFloat(paid_price.toFixed(2)),
    };
    const results = {
        baseline_emission:   baselineEmission,
        projected_emission:  projEmission,
        projected_cost:      projCost,
        emission_change_pct: emissionChangePct,
        projected_risk:      projRisk,
        net_price:           netPrice,
    };

    const { rows: [simulation] } = await pool.query(
        `INSERT INTO company_simulations (user_id, name, inputs, results)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, scenario_name || null, JSON.stringify(cleanInputs), JSON.stringify(results)]
    );
    return simulation;
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. GET SAVED SIMULATIONS  (paginated)
// ─────────────────────────────────────────────────────────────────────────────

const getSavedSimulations = async (userId, { page = 1, limit = 20 } = {}) => {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const safePage  = Math.max(parseInt(page,  10) || 1, 1);
    const offset    = (safePage - 1) * safeLimit;

    const [simsRes, countRes] = await Promise.all([
        pool.query(
            `SELECT id, name, inputs, results, created_at
             FROM company_simulations WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, safeLimit, offset]
        ),
        pool.query(
            'SELECT COUNT(*)::int AS total FROM company_simulations WHERE user_id = $1',
            [userId]
        ),
    ]);

    return {
        simulations: simsRes.rows,
        total:       countRes.rows[0].total,
        page:        safePage,
        limit:       safeLimit,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. GENERATE COMPANY REPORT  (snapshot)
// ─────────────────────────────────────────────────────────────────────────────

const generateCompanyReport = async (userId, { report_type = 'full', period_start, period_end } = {}) => {
    const config = await _getConfig();

    // ── Company profile ───────────────────────────────────────────────────────
    const profile = await getCompanyProfile(userId);

    // ── Emission summary + category breakdown + monthly trend ─────────────────
    const [emRes, categoryRes, trendRes] = await Promise.all([
        pool.query(
            `SELECT COALESCE(SUM(amount), 0)::float AS total_kg,
                    COUNT(*)::int AS record_count,
                    MIN(date)::text AS first_date,
                    MAX(date)::text AS last_date
             FROM emission_records WHERE user_id = $1`,
            [userId]
        ),
        pool.query(
            `SELECT COALESCE(category, 'other') AS category,
                    COALESCE(SUM(amount), 0)::float AS total_kg,
                    COUNT(*)::int AS cnt
             FROM emission_records WHERE user_id = $1
             GROUP BY COALESCE(category, 'other')
             ORDER BY total_kg DESC`,
            [userId]
        ),
        pool.query(
            `SELECT TO_CHAR(date, 'YYYY-MM') AS period,
                    COALESCE(SUM(amount), 0)::float AS total_kg
             FROM emission_records WHERE user_id = $1
             GROUP BY TO_CHAR(date, 'YYYY-MM')
             ORDER BY TO_CHAR(date, 'YYYY-MM') DESC
             LIMIT 12`,
            [userId]
        ),
    ]);

    const totalKg      = parseFloat(emRes.rows[0].total_kg);
    const totalTco2    = parseFloat((totalKg / 1000).toFixed(4));
    const carbonPrice  = config.carbon_price_default;
    const estCost      = parseFloat((totalTco2 * carbonPrice).toFixed(2));
    const riskLevel    = _computeRiskLevel(estCost, config);
    const monthsOfData = trendRes.rows.length;

    const categories = categoryRes.rows.map(r => ({
        category:      r.category,
        total_kg:      parseFloat(r.total_kg),
        total_tco2:    parseFloat((r.total_kg / 1000).toFixed(4)),
        share_pct:     totalKg > 0 ? parseFloat((r.total_kg / totalKg * 100).toFixed(1)) : 0,
        estimated_cost: parseFloat((r.total_kg / 1000 * carbonPrice).toFixed(2)),
    }));

    const monthlyTrend = [...trendRes.rows].reverse().map(r => ({
        period:    r.period,
        total_kg:  parseFloat(r.total_kg),
        total_tco2: parseFloat((r.total_kg / 1000).toFixed(4)),
        est_cost:  parseFloat((r.total_kg / 1000 * carbonPrice).toFixed(2)),
    }));

    // ── CBAM entries summary ──────────────────────────────────────────────────
    const [cbamRes, cbamEntryRows] = await Promise.all([
        pool.query(
            `SELECT COUNT(*)::int AS entry_count,
                    COALESCE(SUM(total_embedded_emission), 0)::float AS total_emission_tco2,
                    COALESCE(SUM(estimated_cbam_cost), 0)::float AS total_cost,
                    MAX(risk_level) AS dominant_risk
             FROM cbam_entries WHERE user_id = $1`,
            [userId]
        ),
        pool.query(
            `SELECT product_name, export_category, period_start::text,
                    total_embedded_emission::float, estimated_cbam_cost::float, risk_level
             FROM cbam_entries WHERE user_id = $1
             ORDER BY estimated_cbam_cost DESC LIMIT 20`,
            [userId]
        ),
    ]);

    const cbamRow = cbamRes.rows[0];

    // ── Task summary ──────────────────────────────────────────────────────────
    const taskRes = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
         FROM company_tasks WHERE user_id = $1`,
        [userId]
    );
    const taskRow = taskRes.rows[0];

    // ── Compliance score (same formula as getDashboard) ───────────────────────
    const RISK_PENALTY = { low: 0, medium: -20, high: -45, critical: -75 };
    let score = 100 + (RISK_PENALTY[riskLevel] ?? 0);
    if (monthsOfData < 3) score -= 10;
    else if (monthsOfData < 6) score -= 5;
    if (taskRow.total > 0) {
        const rate = taskRow.completed / taskRow.total;
        if (rate >= 0.75) score += 5;
        else if (rate >= 0.5) score += 2;
        else if (rate < 0.25 && taskRow.total >= 3) score -= 5;
    }
    const complianceScore = Math.max(5, Math.min(100, Math.round(score)));

    // ── Build snapshot ────────────────────────────────────────────────────────
    const snapshot = {
        company: {
            company_name:        profile?.company_name         ?? null,
            industry:            profile?.industry             ?? null,
            cbam_sector:         profile?.cbam_sector          ?? null,
            exports_to_eu:       profile?.exports_to_eu        ?? false,
            country:             profile?.country              ?? null,
            annual_production:   profile?.annual_production    ? parseFloat(profile.annual_production) : null,
            default_carbon_price: profile?.default_carbon_price ? parseFloat(profile.default_carbon_price) : carbonPrice,
        },
        emission_summary: {
            total_kg:          totalKg,
            total_tco2:        totalTco2,
            record_count:      emRes.rows[0].record_count,
            first_date:        emRes.rows[0].first_date ?? null,
            last_date:         emRes.rows[0].last_date  ?? null,
            carbon_price_used: carbonPrice,
            estimated_cost:    estCost,
            risk_level:        riskLevel,
            months_of_data:    monthsOfData,
        },
        category_breakdown: categories,
        monthly_trend:      monthlyTrend,
        cbam_summary: {
            entry_count:          cbamRow.entry_count,
            total_emission_tco2:  parseFloat(parseFloat(cbamRow.total_emission_tco2).toFixed(4)),
            total_cost:           parseFloat(parseFloat(cbamRow.total_cost).toFixed(2)),
            dominant_risk:        cbamRow.dominant_risk ?? 'low',
            entries:              cbamEntryRows.rows,
        },
        task_summary: {
            total_tasks:     taskRow.total,
            completed_tasks: taskRow.completed,
            completion_rate: taskRow.total > 0
                ? parseFloat((taskRow.completed / taskRow.total).toFixed(2))
                : 0,
        },
        compliance_score: complianceScore,
        generated_at:     new Date().toISOString(),
    };

    // ── Persist report ────────────────────────────────────────────────────────
    const { rows: [report] } = await pool.query(
        `INSERT INTO company_reports (user_id, report_no, report_type, period_start, period_end, snapshot)
         VALUES ($1,
           'EMR-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('company_report_seq')::text, 4, '0'),
           $2, $3, $4, $5
         )
         RETURNING id, report_no, report_type, period_start, period_end, created_at`,
        [
            userId,
            report_type,
            period_start || emRes.rows[0].first_date || null,
            period_end   || emRes.rows[0].last_date  || null,
            JSON.stringify(snapshot),
        ]
    );

    return { ...report, snapshot };
};

// ─────────────────────────────────────────────────────────────────────────────
// 13. GET MY REPORTS
// ─────────────────────────────────────────────────────────────────────────────

const getMyReports = async (userId) => {
    const { rows } = await pool.query(
        `SELECT id, report_no, report_type, period_start, period_end, created_at,
                (snapshot->>'compliance_score')::int       AS compliance_score,
                snapshot->'emission_summary'->>'risk_level' AS risk_level,
                (snapshot->'emission_summary'->>'total_tco2')::float AS total_tco2
         FROM company_reports
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
    );
    return rows;
};

// ─── REPORT ACCESS REQUESTS ───────────────────────────────────────────────────

const requestReportAccess = async (requesterUserId, reportNo) => {
    // 1. Find the report in company_reports
    const { rows: [report] } = await pool.query(
        'SELECT id, user_id FROM company_reports WHERE report_no = $1',
        [reportNo]
    );
    if (!report) _fail(404, 'Bu rapor numarasına ait rapor bulunamadı.');
    if (report.user_id === requesterUserId) _fail(400, 'Kendi raporunuza erişim talebi oluşturamazsınız.');

    // 2. Check for existing pending/approved request
    const { rows: [existing] } = await pool.query(
        `SELECT id, status FROM company_report_access_requests
         WHERE report_id = $1 AND requester_user_id = $2`,
        [report.id, requesterUserId]
    );
    if (existing) {
        if (existing.status === 'pending')  _fail(409, 'Bu rapor için zaten bekleyen bir talebiniz var.');
        if (existing.status === 'approved') _fail(409, 'Bu rapora zaten erişiminiz bulunmaktadır.');
        await pool.query(
            'DELETE FROM company_report_access_requests WHERE id = $1',
            [existing.id]
        );
    }

    // 3. Requester display name
    const { rows: [requesterProfile] } = await pool.query(
        `SELECT COALESCE(cp.company_name, u.name) AS display_name
         FROM users u
         LEFT JOIN company_profiles cp ON cp.user_id = u.id
         WHERE u.id = $1`,
        [requesterUserId]
    );

    // 4. Create request
    const { rows: [req] } = await pool.query(
        `INSERT INTO company_report_access_requests
             (report_id, requester_user_id, owner_user_id, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING *`,
        [report.id, requesterUserId, report.user_id]
    );

    return {
        requestId:     req.id,
        reportId:      report.id,
        reportNo,
        ownerUserId:   report.user_id,
        requesterName: requesterProfile?.display_name || 'Bilinmeyen Şirket',
    };
};

const getIncomingAccessRequests = async (ownerUserId) => {
    const { rows } = await pool.query(
        `SELECT
             r.id, r.report_id, r.requester_user_id, r.status,
             r.created_at, r.updated_at, r.approved_at, r.rejected_at,
             cr.report_no,
             (cr.snapshot->'emission_summary'->>'total_tco2')::float AS report_tco2,
             COALESCE(cp.company_name, u.name) AS requester_name
         FROM company_report_access_requests r
         JOIN company_reports cr ON cr.id = r.report_id
         JOIN users u ON u.id = r.requester_user_id
         LEFT JOIN company_profiles cp ON cp.user_id = r.requester_user_id
         WHERE r.owner_user_id = $1
         ORDER BY r.created_at DESC`,
        [ownerUserId]
    );
    return rows;
};

const getOutgoingAccessRequests = async (requesterUserId) => {
    const { rows } = await pool.query(
        `SELECT
             r.id, r.report_id, r.status,
             r.created_at, r.updated_at, r.approved_at, r.rejected_at,
             cr.report_no,
             (cr.snapshot->'emission_summary'->>'total_tco2')::float AS report_tco2,
             COALESCE(cp.company_name, u.name) AS owner_name
         FROM company_report_access_requests r
         JOIN company_reports cr ON cr.id = r.report_id
         JOIN users u ON u.id = r.owner_user_id
         LEFT JOIN company_profiles cp ON cp.user_id = r.owner_user_id
         WHERE r.requester_user_id = $1
         ORDER BY r.created_at DESC`,
        [requesterUserId]
    );
    return rows;
};

const respondToAccessRequest = async (ownerUserId, requestId, decision) => {
    if (!['approved', 'rejected'].includes(decision)) _fail(400, 'Geçersiz karar. approved veya rejected olmalıdır.');

    const { rows: [req] } = await pool.query(
        'SELECT * FROM company_report_access_requests WHERE id = $1',
        [requestId]
    );
    if (!req) _fail(404, 'Erişim talebi bulunamadı.');
    if (req.owner_user_id !== ownerUserId) _fail(403, 'Bu talebi yalnızca rapor sahibi yanıtlayabilir.');
    if (req.status !== 'pending') _fail(409, `Bu talep zaten ${req.status} durumunda.`);

    const timestampCol = decision === 'approved' ? 'approved_at' : 'rejected_at';
    const { rows: [updated] } = await pool.query(
        `UPDATE company_report_access_requests
         SET status = $1, updated_at = NOW(), ${timestampCol} = NOW()
         WHERE id = $2
         RETURNING *`,
        [decision, requestId]
    );
    return updated;
};

const revokeReportAccess = async (requestingUserId, requestId) => {
    const { rows: [r] } = await pool.query(
        'SELECT id, requester_user_id, owner_user_id, status FROM company_report_access_requests WHERE id = $1',
        [requestId]
    );
    if (!r) _fail(404, 'Erişim talebi bulunamadı.');

    const isOwner     = r.owner_user_id     === requestingUserId;
    const isRequester = r.requester_user_id === requestingUserId;
    if (!isOwner && !isRequester) _fail(403, 'Bu işlem için yetkiniz yok.');
    if (isRequester && !isOwner && r.status !== 'pending') {
        _fail(400, 'Yalnızca bekleyen talepler geri alınabilir. Onaylanmış erişimi kaldırmak için rapor sahibiyle iletişime geçin.');
    }

    await pool.query('DELETE FROM company_report_access_requests WHERE id = $1', [requestId]);
    return { success: true };
};

const getSharedReport = async (requesterUserId, reportId) => {
    const { rows: [cr] } = await pool.query(
        `SELECT cr.id, cr.user_id, cr.report_no, cr.report_type,
                cr.period_start, cr.period_end, cr.created_at, cr.snapshot,
                COALESCE(cp.company_name, u.name) AS owner_name
         FROM company_reports cr
         JOIN users u ON u.id = cr.user_id
         LEFT JOIN company_profiles cp ON cp.user_id = cr.user_id
         WHERE cr.id = $1`,
        [reportId]
    );
    if (!cr) _fail(404, 'Rapor bulunamadı.');

    // Owner always has access; others need an approved request.
    if (cr.user_id !== requesterUserId) {
        const { rows: [access] } = await pool.query(
            `SELECT id FROM company_report_access_requests
             WHERE report_id = $1 AND requester_user_id = $2 AND status = 'approved'`,
            [reportId, requesterUserId]
        );
        if (!access) _fail(403, 'Bu rapora erişim izniniz bulunmamaktadır.');
    }

    const { user_id, ...report } = cr;
    return report;
};

const getPendingIncomingCount = async (ownerUserId) => {
    const { rows: [r] } = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM company_report_access_requests
         WHERE owner_user_id = $1 AND status = 'pending'`,
        [ownerUserId]
    );
    return r?.count ?? 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    getCompanyProfile,
    upsertCompanyProfile,
    getCbamDefaultFactor,
    getPeriodEmissions,
    getCbamSummary,
    createCbamEntry,
    updateCbamEntry,
    getCbamEntries,
    deleteCbamEntry,
    createCompanyTask,
    getCompanyTasks,
    updateCompanyTaskStatus,
    runSimulation,
    getSavedSimulations,
    getDashboard,
    CBAM_SECTORS,
    EMISSION_CATEGORIES,
    generateCompanyReport,
    getMyReports,
    requestReportAccess,
    revokeReportAccess,
    getIncomingAccessRequests,
    getOutgoingAccessRequests,
    respondToAccessRequest,
    getSharedReport,
    getPendingIncomingCount,
};
