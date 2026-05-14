const express          = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const ctrl             = require('../controllers/companyController');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE-LEVEL MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requireCompanyRole
 * Rejects household and individual accounts before any company logic runs.
 * Reads req.user.role set by authenticate — no extra DB call.
 */
const requireCompanyRole = (req, res, next) => {
    if (req.user.role !== 'company') {
        return res.status(403).json({
            success: false,
            message: 'Bu özellik yalnızca şirket hesapları için kullanılabilir.',
        });
    }
    next();
};

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL GUARDS — JWT first, then account-type check
// ─────────────────────────────────────────────────────────────────────────────
router.use(authenticate);
router.use(requireCompanyRole);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Company profile
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/company/profile — fetch CBAM profile (null if not yet created)
router.get('/profile',  ctrl.getCompanyProfile);

// PUT  /api/company/profile — create or update CBAM profile fields
router.put('/profile',  ctrl.upsertCompanyProfile);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: CBAM entries
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/company/cbam/summary         — CBAM tax estimate from emission_records (primary)
router.get('/cbam/summary',          ctrl.getCbamSummary);

// GET  /api/company/cbam/period-emissions — emission totals for a YYYY-MM period (for auto-derive)
router.get('/cbam/period-emissions', ctrl.getPeriodEmissions);

// GET  /api/company/cbam/entries     — list all entries for the authenticated user
router.get('/cbam/entries',        ctrl.getCbamEntries);

// POST /api/company/cbam/entries     — create entry + compute CBAM cost + risk level
router.post('/cbam/entries',       ctrl.createCbamEntry);

// PATCH  /api/company/cbam/entries/:id — update mutable fields (paid_price, notes, etc.)
router.patch('/cbam/entries/:id',  ctrl.updateCbamEntry);

// DELETE /api/company/cbam/entries/:id — delete own entry (ownership enforced in service)
router.delete('/cbam/entries/:id', ctrl.deleteCbamEntry);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Dashboard
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard', ctrl.getCompanyDashboard);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Company tasks
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tasks',               ctrl.getCompanyTasks);
router.post('/tasks',              ctrl.createCompanyTask);
router.patch('/tasks/:id/status',  ctrl.updateCompanyTaskStatus);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: What-if simulation
// ─────────────────────────────────────────────────────────────────────────────
router.post('/simulate',       ctrl.runSimulation);
router.get('/simulate/saved',  ctrl.getSavedSimulations);

module.exports = router;
