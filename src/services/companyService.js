const pool = require('../config/db');

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
            _fail(400, `${periodStr} dönemine ait emisyon kaydı bulunamadı. Tüketim verisi girdikten sonra tekrar deneyin veya emisyon faktörünü manuel olarak girin.`);
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

    let baselineEmission = null;
    let targetEmission   = null;

    if (cleanCategory && cleanPct !== null) {
        const { rows: [bRow] } = await pool.query(
            `SELECT COALESCE(SUM(amount), 0)::float AS baseline_kg
             FROM emission_records
             WHERE user_id = $1 AND COALESCE(category, 'other') = $2`,
            [userId, cleanCategory]
        );
        const rawKg = parseFloat(bRow?.baseline_kg ?? 0);
        if (rawKg > 0) {
            const rawTco2    = rawKg / 1000;
            baselineEmission = parseFloat(rawTco2.toFixed(4));
            targetEmission   = parseFloat((rawTco2 * (1 - cleanPct / 100)).toFixed(4));
        }
    }

    const { rows: [task] } = await pool.query(
        `INSERT INTO company_tasks
             (user_id, title, description, emission_category, target_reduction_pct,
              baseline_emission, target_emission, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        ]
    );
    return task;
};

const _addProgressToCompanyTasks = async (tasks, userId) => {
    const trackingTasks = tasks.filter(t => t.emission_category);
    if (!trackingTasks.length) return tasks;

    const categories = [...new Set(trackingTasks.map(t => t.emission_category))];

    const { rows: emRows } = await pool.query(
        `SELECT COALESCE(category, 'other') AS emission_category,
                COALESCE(SUM(amount), 0)::float / 1000 AS current_tco2
         FROM emission_records
         WHERE user_id = $1 AND COALESCE(category, 'other') = ANY($2)
         GROUP BY COALESCE(category, 'other')`,
        [userId, categories]
    );

    const currentByCategory = {};
    emRows.forEach(r => { currentByCategory[r.emission_category] = parseFloat(r.current_tco2); });

    const progressById = {};
    trackingTasks.forEach(t => {
        const current = currentByCategory[t.emission_category] ?? null;

        if (t.target_emission == null) {
            progressById[t.id] = { current_emission: current, progress_status: 'no_baseline' };
            return;
        }
        if (current === null) {
            progressById[t.id] = { current_emission: null, progress_status: 'no_data' };
            return;
        }

        const target   = parseFloat(t.target_emission);
        const baseline = parseFloat(t.baseline_emission);
        let progress_status;

        if (current <= target)              progress_status = 'successful';
        else if (current < baseline)        progress_status = 'on_track';
        else if (current <= baseline * 1.05) progress_status = 'at_risk';
        else                                progress_status = 'off_track';

        progressById[t.id] = { current_emission: current, progress_status };
    });

    return tasks.map(t => ({ ...t, ...(progressById[t.id] || {}) }));
};

const getCompanyTasks = async (userId) => {
    const { rows } = await pool.query(
        `SELECT * FROM company_tasks
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
    );
    return _addProgressToCompanyTasks(rows, userId);
};

const updateCompanyTaskStatus = async (userId, taskId, status) => {
    const VALID = ['pending', 'in_progress', 'completed'];
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
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    getCompanyProfile,
    upsertCompanyProfile,
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
};
