const svc = require('../services/householdService');

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Successful response — always the same shape.
const ok = (res, data, message = 'Başarılı.', status = 200) =>
    res.status(status).json({ success: true, message, data });

// Expected (shaped) errors have err.status set by _fail() in the service.
// Unexpected errors get a generic 500 and are logged server-side only.
const handle = (res, err) => {
    if (err.status) {
        return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('[householdController]', err.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
};

// ─────────────────────────────────────────────────────────────────────────────
// INPUT GUARDS  (lightweight format checks — business rules stay in service)
// ─────────────────────────────────────────────────────────────────────────────

// Returns a trimmed string or null.
const str = (v) => (typeof v === 'string' ? v.trim() : null);

// Returns a positive integer or null.
const posInt = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
};

// Returns a positive float or null.
const posFloat = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};

// Returns a YYYY-MM-DD string or null.
const dateStr = (v) => {
    const s = str(v);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: req.membership is attached by the requireMember / requireAdmin
// middleware defined in householdRoutes.js.  It contains:
//   { household_id, role, admin_user_id, household_name, ... }
// Endpoints that use it are annotated below.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1. POST /api/households/create
//    Any authenticated user who is not already in a household.
// ─────────────────────────────────────────────────────────────────────────────
const createHousehold = async (req, res) => {
    const name = str(req.body.name);
    if (!name || name.length < 2) {
        return res.status(400).json({ success: false, message: 'Hane adı en az 2 karakter olmalıdır.' });
    }

    // monthly_target is optional; service validates the numeric range
    const monthlyTarget = req.body.monthly_target ?? null;

    try {
        const household = await svc.createHousehold(req.user.id, name, monthlyTarget);
        return ok(res, { household }, 'Hane başarıyla oluşturuldu.', 201);
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. POST /api/households/join
//    Any authenticated user who is not already in a household.
// ─────────────────────────────────────────────────────────────────────────────
const joinHousehold = async (req, res) => {
    const inviteCode = str(req.body.invite_code);
    if (!inviteCode) {
        return res.status(400).json({ success: false, message: 'Davet kodu gereklidir.' });
    }

    try {
        const result = await svc.joinHousehold(req.user.id, inviteCode);
        return ok(res, result, 'Haneye başarıyla katıldınız.');
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/households/me
//    Any authenticated user. Returns null data if not in a household.
// ─────────────────────────────────────────────────────────────────────────────
const getMyHousehold = async (req, res) => {
    try {
        const household = await svc.getMyHousehold(req.user.id);
        if (!household) {
            return ok(res, { household: null }, 'Henüz bir haneye üye değilsiniz.');
        }
        return ok(res, { household });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /api/households/dashboard
//    Any household member.  req.membership set by requireMember middleware.
// ─────────────────────────────────────────────────────────────────────────────
const getHouseholdDashboard = async (req, res) => {
    try {
        const dashboard = await svc.getHouseholdDashboard(req.membership.household_id);
        return ok(res, { dashboard });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /api/households/members
//    Admin only.  req.membership set by requireAdmin middleware.
// ─────────────────────────────────────────────────────────────────────────────
const getMembers = async (req, res) => {
    try {
        const members = await svc.getMembers(req.membership.household_id);
        return ok(res, { members });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET /api/households/members/:userId/emissions
//    Admin only.
// ─────────────────────────────────────────────────────────────────────────────
const getMemberEmissions = async (req, res) => {
    const memberId = posInt(req.params.userId);
    if (!memberId) {
        return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı kimliği.' });
    }

    try {
        const emissions = await svc.getMemberEmissions(req.membership.household_id, memberId);
        return ok(res, { emissions });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST /api/households/tasks
//    Admin only.
// ─────────────────────────────────────────────────────────────────────────────
const createTask = async (req, res) => {
    const title = str(req.body.title);
    if (!title) {
        return res.status(400).json({ success: false, message: 'Görev başlığı gereklidir.' });
    }

    const taskData = {
        title,
        description:       str(req.body.description),
        assigned_to:       posInt(req.body.assigned_to),   // null = whole-household task
        target_reduction:  posFloat(req.body.target_reduction),
        due_date:          dateStr(req.body.due_date),
        emission_category: str(req.body.emission_category) || null,
        target_pct:        req.body.target_pct != null ? parseFloat(req.body.target_pct) : null,
    };

    // Reject an assigned_to value that failed the posInt check but was provided
    if (req.body.assigned_to !== undefined && req.body.assigned_to !== null && !taskData.assigned_to) {
        return res.status(400).json({ success: false, message: 'assigned_to geçerli bir kullanıcı kimliği olmalıdır.' });
    }

    // Reject a due_date value that failed the date format check but was provided
    if (req.body.due_date !== undefined && req.body.due_date !== null && !taskData.due_date) {
        return res.status(400).json({ success: false, message: 'due_date YYYY-MM-DD formatında olmalıdır.' });
    }

    try {
        const task = await svc.createTask(req.membership.household_id, req.user.id, taskData);
        return ok(res, { task }, 'Görev başarıyla oluşturuldu.', 201);
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. GET /api/households/tasks
//    Admin only.
// ─────────────────────────────────────────────────────────────────────────────
const getTasks = async (req, res) => {
    try {
        const tasks = await svc.getTasks(req.membership.household_id);
        return ok(res, { tasks });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. PATCH /api/households/tasks/:taskId/status
//    Admin only.
// ─────────────────────────────────────────────────────────────────────────────
const updateTaskStatus = async (req, res) => {
    const taskId = posInt(req.params.taskId);
    if (!taskId) {
        return res.status(400).json({ success: false, message: 'Geçersiz görev kimliği.' });
    }

    const status = str(req.body.status);
    if (!status) {
        return res.status(400).json({ success: false, message: 'Durum (status) gereklidir.' });
    }

    try {
        const task = await svc.updateTaskStatus(
            req.membership.household_id,
            taskId,
            status,
            req.user.id,
            req.membership.role
        );
        return ok(res, { task }, 'Görev durumu güncellendi.');
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. POST /api/households/emissions/:emissionId/comments
//     Admin only.
// ─────────────────────────────────────────────────────────────────────────────
const addComment = async (req, res) => {
    const emissionId = posInt(req.params.emissionId);
    if (!emissionId) {
        return res.status(400).json({ success: false, message: 'Geçersiz emisyon kaydı kimliği.' });
    }

    const comment = str(req.body.comment);
    if (!comment) {
        return res.status(400).json({ success: false, message: 'Yorum metni gereklidir.' });
    }

    try {
        const saved = await svc.addComment(
            emissionId,
            req.membership.household_id,
            req.user.id,
            comment
        );
        return ok(res, { comment: saved }, 'Yorum eklendi.', 201);
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. GET /api/households/emissions/:emissionId/comments
//     Admin only.
// ─────────────────────────────────────────────────────────────────────────────
const getComments = async (req, res) => {
    const emissionId = posInt(req.params.emissionId);
    if (!emissionId) {
        return res.status(400).json({ success: false, message: 'Geçersiz emisyon kaydı kimliği.' });
    }

    try {
        const comments = await svc.getComments(
            emissionId,
            req.membership.household_id,
            req.user.id,
            req.membership.role
        );
        return ok(res, { comments });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. GET /api/households/comparison
//     Any household member.
// ─────────────────────────────────────────────────────────────────────────────
const getHouseholdComparison = async (req, res) => {
    try {
        const comparison = await svc.getHouseholdComparison(req.membership.household_id);
        return ok(res, { comparison });
    } catch (err) {
        return handle(res, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    createHousehold,
    joinHousehold,
    getMyHousehold,
    getHouseholdDashboard,
    getMembers,
    getMemberEmissions,
    createTask,
    getTasks,
    updateTaskStatus,
    addComment,
    getComments,
    getHouseholdComparison,
};
