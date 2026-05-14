const svc = require('../services/companyService');

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const ok = (res, data, message = 'Başarılı.', status = 200) =>
    res.status(status).json({ success: true, message, data });

const handle = (res, err) => {
    if (err.status) {
        return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('[companyController]', err.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
};

// ─────────────────────────────────────────────────────────────────────────────
// INPUT GUARDS
// ─────────────────────────────────────────────────────────────────────────────

const str = (v) => (typeof v === 'string' ? v.trim() : null);

const posFloat = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};

const nonNegFloat = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

const dateStr = (v) => {
    const s = str(v);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const posInt = (v, def = 1) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : def;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/company/profile
// ─────────────────────────────────────────────────────────────────────────────
const getCompanyProfile = async (req, res) => {
    try {
        const profile = await svc.getCompanyProfile(req.user.id);
        if (!profile) {
            return ok(res, { profile: null }, 'Henüz şirket profili oluşturulmamış.');
        }
        return ok(res, { profile });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. PUT /api/company/profile
// ─────────────────────────────────────────────────────────────────────────────
const upsertCompanyProfile = async (req, res) => {
    const {
        company_name,
        cbam_sector,
        exports_to_eu,
        annual_production,
        country,
        default_carbon_price,
    } = req.body;

    if (cbam_sector !== undefined && cbam_sector !== null && cbam_sector !== '') {
        const clean = str(cbam_sector);
        if (!clean || !svc.CBAM_SECTORS.includes(clean)) {
            return res.status(400).json({
                success:  false,
                message:  `Geçersiz CBAM sektörü. Geçerli değerler: ${svc.CBAM_SECTORS.join(', ')}.`,
            });
        }
    }

    if (annual_production !== undefined && annual_production !== null && annual_production !== '') {
        if (!posFloat(annual_production)) {
            return res.status(400).json({
                success: false,
                message: 'Yıllık üretim miktarı pozitif bir sayı olmalıdır.',
            });
        }
    }

    try {
        const profile = await svc.upsertCompanyProfile(req.user.id, {
            company_name:         str(company_name)     || null,
            cbam_sector:          str(cbam_sector)      || null,
            exports_to_eu:        exports_to_eu === true || exports_to_eu === 'true',
            annual_production:    annual_production     ?? null,
            country:              str(country)          || null,
            default_carbon_price: default_carbon_price  ?? null,
        });
        return ok(res, { profile }, 'Şirket profili güncellendi.');
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/company/cbam/summary
// ─────────────────────────────────────────────────────────────────────────────
const getCbamSummary = async (req, res) => {
    try {
        const summary = await svc.getCbamSummary(req.user.id);
        return ok(res, { summary });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /api/company/cbam/period-emissions
// ─────────────────────────────────────────────────────────────────────────────
const getPeriodEmissions = async (req, res) => {
    const period = str(req.query.period);
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
        return res.status(400).json({ success: false, message: 'Dönem YYYY-MM formatında olmalıdır.' });
    }
    try {
        const data = await svc.getPeriodEmissions(req.user.id, period);
        return ok(res, data);
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST /api/company/cbam/entries
// ─────────────────────────────────────────────────────────────────────────────
const createCbamEntry = async (req, res) => {
    const exportCat   = str(req.body.export_category);
    const exportAmt   = posFloat(req.body.export_amount);
    const period      = dateStr(req.body.period_start);
    const paidPrice   = nonNegFloat(req.body.paid_carbon_price) ?? 0;

    if (!exportCat || !svc.CBAM_SECTORS.includes(exportCat)) {
        return res.status(400).json({ success: false, message: 'Geçerli bir CBAM kategorisi seçilmelidir.' });
    }
    if (!exportAmt) {
        return res.status(400).json({ success: false, message: 'İhracat miktarı pozitif bir sayı olmalıdır.' });
    }
    if (!period) {
        return res.status(400).json({ success: false, message: 'Dönem tarihi YYYY-MM-DD formatında olmalıdır.' });
    }

    const today = new Date().toISOString().split('T')[0];
    if (period > today) {
        return res.status(400).json({ success: false, message: 'Gelecek döneme kayıt eklenemez.' });
    }

    const rawFactor = req.body.emission_factor;
    let emFactor = null;
    if (rawFactor !== undefined && rawFactor !== null && rawFactor !== '') {
        emFactor = posFloat(rawFactor);
        if (emFactor === null) {
            return res.status(400).json({ success: false, message: 'Emisyon faktörü pozitif bir sayı olmalıdır.' });
        }
    }

    const rawPrice = req.body.carbon_price;
    let carbonPrice = null;
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
        carbonPrice = nonNegFloat(rawPrice);
        if (carbonPrice === null) {
            return res.status(400).json({ success: false, message: 'Karbon fiyatı sıfır veya pozitif bir sayı olmalıdır.' });
        }
    }

    // period_end: optional, must be >= period_start when provided
    const periodEnd = dateStr(req.body.period_end);
    if (periodEnd && periodEnd < period) {
        return res.status(400).json({ success: false, message: 'Dönem bitiş tarihi, başlangıç tarihinden önce olamaz.' });
    }

    // Sanitize free-text fields: cap at reasonable lengths
    const rawNotes = str(req.body.notes);
    if (rawNotes && rawNotes.length > 2000) {
        return res.status(400).json({ success: false, message: 'Notlar en fazla 2000 karakter olabilir.' });
    }

    try {
        const entry = await svc.createCbamEntry(req.user.id, {
            product_name:       str(req.body.product_name) || null,
            export_category:    exportCat,
            export_amount:      exportAmt,
            emission_factor:    emFactor,
            carbon_price:       carbonPrice,
            paid_carbon_price:  paidPrice,
            period_start:       period,
            period_end:         periodEnd,
            destination_region: str(req.body.destination_region) || null,
            notes:              rawNotes,
        });

        const { warning, ...entryData } = entry;
        return ok(res, { entry: entryData, warning: warning ?? null }, 'CBAM kaydı oluşturuldu.', 201);
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. PATCH /api/company/cbam/entries/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateCbamEntry = async (req, res) => {
    const entryId = parseInt(req.params.id, 10);
    if (!Number.isFinite(entryId) || entryId <= 0) {
        return res.status(400).json({ success: false, message: 'Geçersiz kayıt kimliği.' });
    }

    const paidPrice = req.body.paid_carbon_price !== undefined
        ? nonNegFloat(req.body.paid_carbon_price)
        : undefined;

    if (paidPrice === null) {
        return res.status(400).json({ success: false, message: 'Ödenen karbon fiyatı sıfır veya pozitif bir sayı olmalıdır.' });
    }

    const periodEnd = req.body.period_end !== undefined ? dateStr(req.body.period_end) : undefined;

    const rawNotes = req.body.notes !== undefined ? str(req.body.notes) : undefined;
    if (rawNotes !== undefined && rawNotes && rawNotes.length > 2000) {
        return res.status(400).json({ success: false, message: 'Notlar en fazla 2000 karakter olabilir.' });
    }

    try {
        const entry = await svc.updateCbamEntry(req.user.id, entryId, {
            product_name:       req.body.product_name       !== undefined ? str(req.body.product_name)       : undefined,
            notes:              rawNotes,
            destination_region: req.body.destination_region !== undefined ? str(req.body.destination_region) : undefined,
            period_end:         periodEnd,
            paid_carbon_price:  paidPrice,
        });

        const { warning, ...entryData } = entry;
        return ok(res, { entry: entryData, warning: warning ?? null }, 'Kayıt güncellendi.');
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET /api/company/cbam/entries
// ─────────────────────────────────────────────────────────────────────────────
const getCbamEntries = async (req, res) => {
    try {
        const result = await svc.getCbamEntries(req.user.id, {
            page:  posInt(req.query.page,  1),
            limit: posInt(req.query.limit, 20),
        });
        return ok(res, result);
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. DELETE /api/company/cbam/entries/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteCbamEntry = async (req, res) => {
    const entryId = parseInt(req.params.id, 10);
    if (!Number.isFinite(entryId) || entryId <= 0) {
        return res.status(400).json({ success: false, message: 'Geçersiz kayıt kimliği.' });
    }

    try {
        await svc.deleteCbamEntry(req.user.id, entryId);
        return ok(res, {}, 'Kayıt silindi.');
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. GET  /api/company/tasks
// ─────────────────────────────────────────────────────────────────────────────
const getCompanyTasks = async (req, res) => {
    try {
        const tasks = await svc.getCompanyTasks(req.user.id);
        return ok(res, { tasks });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. POST /api/company/tasks
// ─────────────────────────────────────────────────────────────────────────────
const createCompanyTask = async (req, res) => {
    const cleanTitle = str(req.body.title);
    if (!cleanTitle) {
        return res.status(400).json({ success: false, message: 'Görev başlığı gereklidir.' });
    }

    const { target_reduction_pct, due_date } = req.body;

    if (target_reduction_pct !== undefined && target_reduction_pct !== null && target_reduction_pct !== '') {
        const pct = parseFloat(target_reduction_pct);
        if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
            return res.status(400).json({ success: false, message: 'Azaltım hedefi 1 ile 99 arasında olmalıdır.' });
        }
    }

    try {
        const task = await svc.createCompanyTask(req.user.id, {
            title:               cleanTitle,
            description:         str(req.body.description),
            emission_category:   str(req.body.emission_category),
            target_reduction_pct: target_reduction_pct ?? null,
            due_date:            dateStr(due_date),
        });
        return ok(res, { task }, 'Görev oluşturuldu.', 201);
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. PATCH /api/company/tasks/:id/status
// ─────────────────────────────────────────────────────────────────────────────
const updateCompanyTaskStatus = async (req, res) => {
    const taskId = parseInt(req.params.id, 10);
    if (!Number.isFinite(taskId) || taskId <= 0) {
        return res.status(400).json({ success: false, message: 'Geçersiz görev kimliği.' });
    }

    const { status } = req.body;
    if (!status) {
        return res.status(400).json({ success: false, message: 'Durum alanı gereklidir.' });
    }

    try {
        const task = await svc.updateCompanyTaskStatus(req.user.id, taskId, status);
        return ok(res, { task }, 'Görev durumu güncellendi.');
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. POST /api/company/simulate
// ─────────────────────────────────────────────────────────────────────────────
const runSimulation = async (req, res) => {
    const carbonPrice = nonNegFloat(req.body.carbon_price);
    if (carbonPrice === null) {
        return res.status(400).json({ success: false, message: 'Karbon fiyatı sıfır veya pozitif bir sayı olmalıdır.' });
    }

    const exportPct = req.body.export_change_pct !== undefined && req.body.export_change_pct !== ''
        ? parseFloat(req.body.export_change_pct) : 0;
    const factorPct = req.body.emission_factor_change_pct !== undefined && req.body.emission_factor_change_pct !== ''
        ? parseFloat(req.body.emission_factor_change_pct) : 0;
    const paidPrice = nonNegFloat(req.body.paid_price) ?? 0;

    if (!Number.isFinite(exportPct)) {
        return res.status(400).json({ success: false, message: 'İhracat hacmi değişimi geçerli bir sayı olmalıdır.' });
    }
    if (!Number.isFinite(factorPct)) {
        return res.status(400).json({ success: false, message: 'Emisyon faktörü değişimi geçerli bir sayı olmalıdır.' });
    }

    const rawName = str(req.body.scenario_name);
    if (rawName && rawName.length > 500) {
        return res.status(400).json({ success: false, message: 'Senaryo adı en fazla 500 karakter olabilir.' });
    }

    try {
        const simulation = await svc.runSimulation(req.user.id, {
            scenario_name:             rawName || null,
            carbon_price:              carbonPrice,
            export_change_pct:         exportPct,
            emission_factor_change_pct: factorPct,
            paid_price:                paidPrice,
        });
        return ok(res, { simulation }, 'Simülasyon kaydedildi.', 201);
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 13. GET /api/company/simulate/saved
// ─────────────────────────────────────────────────────────────────────────────
const getSavedSimulations = async (req, res) => {
    try {
        const result = await svc.getSavedSimulations(req.user.id, {
            page:  posInt(req.query.page,  1),
            limit: posInt(req.query.limit, 20),
        });
        return ok(res, result);
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 14. GET /api/company/dashboard
// ─────────────────────────────────────────────────────────────────────────────
const getCompanyDashboard = async (req, res) => {
    try {
        const dashboard = await svc.getDashboard(req.user.id);
        return ok(res, { dashboard });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    getCompanyProfile,
    upsertCompanyProfile,
    getCbamSummary,
    getPeriodEmissions,
    createCbamEntry,
    updateCbamEntry,
    getCbamEntries,
    deleteCbamEntry,
    getCompanyTasks,
    createCompanyTask,
    updateCompanyTaskStatus,
    runSimulation,
    getSavedSimulations,
    getCompanyDashboard,
};
