const express    = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const svc        = require('../services/householdService');
const ctrl       = require('../controllers/householdController');
const { checkRateLimit } = require('../utils/rateLimiter');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE-LEVEL MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requireMember
 * Verifies the authenticated user belongs to a household.
 * On success, attaches the full membership object to req.membership so every
 * downstream handler (and requireAdmin) can use req.membership.household_id
 * and req.membership.role without an extra DB round-trip.
 */
const requireMember = async (req, res, next) => {
    try {
        const membership = await svc.getUserMembership(req.user.id);
        if (!membership) {
            return res.status(403).json({
                success: false,
                message: 'Bu işlem için bir haneye üye olmanız gerekmektedir.',
            });
        }
        req.membership = membership;
        next();
    } catch (err) {
        console.error('[requireMember]', err.message);
        return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
};

/**
 * requireHouseholdRole
 * Rejects individual and company accounts before any household logic runs.
 * Reads req.user.role set by authenticate — no extra DB call.
 */
const requireHouseholdRole = (req, res, next) => {
    if (req.user.role !== 'household') {
        return res.status(403).json({
            success: false,
            message: 'Bu özellik yalnızca hane hesapları için kullanılabilir.',
        });
    }
    next();
};

/**
 * requireAdmin
 * Must run AFTER requireMember — reads req.membership.role, makes no DB call.
 * Returns 403 if the requesting user is not the household admin.
 */
const requireAdmin = (req, res, next) => {
    if (req.membership.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Bu işlem yalnızca hane yöneticisi tarafından yapılabilir.',
        });
    }
    next();
};

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL GUARDS — JWT first, then account-type check
// ─────────────────────────────────────────────────────────────────────────────
router.use(authenticate);
router.use(requireHouseholdRole);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Public authenticated routes
// No household membership required. Any logged-in user may call these.
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/households/create — create a new household; user becomes admin
router.post('/create', ctrl.createHousehold);

// POST /api/households/join — join an existing household via invite code
router.post('/join', (req, res, next) => {
    try { checkRateLimit(`join:${req.ip}`, 5, 10 * 60 * 1000); next(); }
    catch (e) { return res.status(429).json({ success: false, message: e.message }); }
}, ctrl.joinHousehold);

// GET /api/households/me — return the user's household summary, or null
router.get('/me', ctrl.getMyHousehold);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Member routes
// User must belong to a household. requireMember enforces this and
// attaches req.membership for all handlers in this section.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/households/dashboard — household totals, trends, recent tasks
router.get('/dashboard', requireMember, ctrl.getHouseholdDashboard);

// GET /api/households/comparison — compare household against similar-sized ones
router.get('/comparison', requireMember, ctrl.getHouseholdComparison);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Admin-only routes
// User must belong to the household AND have role = 'admin'.
// requireAdmin MUST come after requireMember (it reads req.membership.role).
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/households/members — all members + aggregated emissions
router.get('/members', requireMember, requireAdmin, ctrl.getMembers);

// GET /api/households/members/:userId/emissions — one member's full records
router.get('/members/:userId/emissions', requireMember, requireAdmin, ctrl.getMemberEmissions);

// POST /api/households/tasks — assign a new task
router.post('/tasks', requireMember, requireAdmin, ctrl.createTask);

// GET /api/households/tasks — list all household tasks (all members can view)
router.get('/tasks', requireMember, ctrl.getTasks);

// PATCH /api/households/tasks/:taskId/status — update task status (members can update their own tasks)
router.patch('/tasks/:taskId/status', requireMember, ctrl.updateTaskStatus);

// POST /api/households/emissions/:emissionId/comments — add admin comment
router.post('/emissions/:emissionId/comments', requireMember, requireAdmin, ctrl.addComment);

// GET /api/households/emissions/:emissionId/comments — view admin comments (members see own records only)
router.get('/emissions/:emissionId/comments', requireMember, ctrl.getComments);

module.exports = router;
