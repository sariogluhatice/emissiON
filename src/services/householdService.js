const crypto = require('crypto');
const pool   = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Generates an 8-character uppercase hex string, e.g. "3F2A1C9B".
const _generateCode = () =>
    crypto.randomBytes(4).toString('hex').toUpperCase();

// Produces a unique invite code with up to 5 collision retries.
const _uniqueInviteCode = async () => {
    for (let i = 0; i < 5; i++) {
        const code = _generateCode();
        const { rows } = await pool.query(
            'SELECT id FROM households WHERE invite_code = $1',
            [code]
        );
        if (rows.length === 0) return code;
    }
    throw new Error('Davet kodu oluşturulamadı, lütfen tekrar deneyin.');
};

// Throws a shaped error that the controller can turn into an HTTP response.
// Usage: _fail(409, 'Zaten bir haneye üyesiniz.')
const _fail = (status, message) => {
    const err = new Error(message);
    err.status = status;
    throw err;
};

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERSHIP LOOKUP  (used as a security primitive throughout the service)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the household membership row for a user, or null if not a member.
 * Includes household-level fields so callers can avoid an extra JOIN.
 */
const getUserMembership = async (userId) => {
    const { rows } = await pool.query(
        `SELECT
            hm.id           AS membership_id,
            hm.household_id,
            hm.role,
            hm.joined_at,
            h.name          AS household_name,
            h.admin_user_id,
            h.invite_code,
            h.monthly_target,
            h.created_at    AS household_created_at
         FROM household_members hm
         JOIN households h ON h.id = hm.household_id
         WHERE hm.user_id = $1`,
        [userId]
    );
    return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE HOUSEHOLD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new household and adds the creator as admin in a single transaction.
 * Throws 409 if the user is already in a household.
 */
const createHousehold = async (userId, name, monthlyTarget) => {
    const existing = await getUserMembership(userId);
    if (existing) _fail(409, 'Zaten bir haneye üyesiniz. Önce mevcut haneden ayrılmanız gerekir.');

    const inviteCode = await _uniqueInviteCode();
    const target     = monthlyTarget ? parseFloat(monthlyTarget) : null;
    if (target !== null && (isNaN(target) || target <= 0)) {
        _fail(400, 'Aylık hedef pozitif bir sayı olmalıdır.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [household] } = await client.query(
            `INSERT INTO households (name, admin_user_id, invite_code, monthly_target)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, admin_user_id, invite_code, monthly_target, created_at`,
            [name, userId, inviteCode, target]
        );

        await client.query(
            `INSERT INTO household_members (household_id, user_id, role)
             VALUES ($1, $2, 'admin')`,
            [household.id, userId]
        );

        await client.query('COMMIT');
        return household;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. JOIN HOUSEHOLD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds a user to a household via invite code.
 * Throws 409 if already a member, 404 if code does not match any household.
 */
const joinHousehold = async (userId, rawCode) => {
    const existing = await getUserMembership(userId);
    if (existing) _fail(409, 'Zaten bir haneye üyesiniz.');

    const inviteCode = String(rawCode || '').trim().toUpperCase();
    if (!inviteCode) _fail(400, 'Davet kodu gereklidir.');

    const { rows } = await pool.query(
        'SELECT id, name FROM households WHERE invite_code = $1',
        [inviteCode]
    );
    if (rows.length === 0) _fail(404, 'Geçersiz davet kodu.');

    const household = rows[0];

    const { rows: [member] } = await pool.query(
        `INSERT INTO household_members (household_id, user_id, role)
         VALUES ($1, $2, 'member')
         RETURNING id, household_id, user_id, role, joined_at`,
        [household.id, userId]
    );

    return { household, member };
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET MY HOUSEHOLD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a user's household overview.
 * invite_code is only included for the admin.
 * Returns null if the user is not in any household.
 */
const getMyHousehold = async (userId) => {
    const m = await getUserMembership(userId);
    if (!m) return null;

    const { rows: [stats] } = await pool.query(
        `SELECT
            COUNT(DISTINCT hm.user_id)          AS member_count,
            COALESCE(SUM(er.amount), 0)::float  AS total_emissions
         FROM household_members hm
         LEFT JOIN emission_records er ON er.user_id = hm.user_id
         WHERE hm.household_id = $1`,
        [m.household_id]
    );

    return {
        id:               m.household_id,
        name:             m.household_name,
        role:             m.role,
        admin_user_id:    m.admin_user_id,
        invite_code:      m.role === 'admin' ? m.invite_code : undefined,
        monthly_target:   m.monthly_target,
        created_at:       m.household_created_at,
        member_count:     parseInt(stats.member_count, 10),
        total_emissions:  parseFloat(stats.total_emissions),
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. HOUSEHOLD DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all data needed for the household dashboard:
 *   total emissions, last-6-month monthly series, category breakdown, recent tasks.
 * Queries are parallelised with Promise.all.
 */
const getHouseholdDashboard = async (householdId) => {
    const [totalRes, monthlyRes, categoryRes, tasksRes] = await Promise.all([

        pool.query(
            `SELECT COALESCE(SUM(er.amount), 0)::float AS total_emissions
             FROM household_members hm
             JOIN emission_records er ON er.user_id = hm.user_id
             WHERE hm.household_id = $1`,
            [householdId]
        ),

        pool.query(
            `SELECT
                TO_CHAR(er.date, 'YYYY-MM') AS month,
                SUM(er.amount)::float        AS total_amount
             FROM household_members hm
             JOIN emission_records er ON er.user_id = hm.user_id
             WHERE hm.household_id = $1
             GROUP BY month
             ORDER BY month DESC
             LIMIT 6`,
            [householdId]
        ),

        pool.query(
            `SELECT
                COALESCE(er.category, 'Diğer') AS category,
                SUM(er.amount)::float            AS total_amount
             FROM household_members hm
             JOIN emission_records er ON er.user_id = hm.user_id
             WHERE hm.household_id = $1
             GROUP BY er.category
             ORDER BY total_amount DESC`,
            [householdId]
        ),

        pool.query(
            `SELECT
                ht.id, ht.title, ht.status, ht.due_date,
                ht.assigned_to,
                u.name AS assigned_to_name
             FROM household_tasks ht
             LEFT JOIN users u ON u.id = ht.assigned_to
             WHERE ht.household_id = $1
             ORDER BY ht.created_at DESC
             LIMIT 5`,
            [householdId]
        ),

    ]);

    const recentTasks = await _addProgressToTasks(tasksRes.rows, householdId);

    return {
        total_emissions:    parseFloat(totalRes.rows[0].total_emissions),
        monthly_emissions:  monthlyRes.rows,
        category_breakdown: categoryRes.rows,
        recent_tasks:       recentTasks,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. MEMBERS LIST  (admin only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all household members with aggregated emission totals.
 * Does NOT return individual emission records — those are in getMemberEmissions.
 */
const getMembers = async (householdId) => {
    const { rows } = await pool.query(
        `SELECT
            hm.id        AS membership_id,
            hm.user_id,
            hm.role,
            hm.joined_at,
            u.name,
            u.email,
            COALESCE(SUM(er.amount), 0)::float AS total_emissions,
            COUNT(er.id)::int                  AS record_count
         FROM household_members hm
         JOIN users u ON u.id = hm.user_id
         LEFT JOIN emission_records er ON er.user_id = hm.user_id
         WHERE hm.household_id = $1
         GROUP BY hm.id, hm.user_id, hm.role, hm.joined_at, u.name, u.email
         ORDER BY hm.joined_at ASC`,
        [householdId]
    );
    return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. MEMBER EMISSIONS  (admin only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all emission records for one specific household member.
 * First verifies the target user actually belongs to this household.
 */
const getMemberEmissions = async (householdId, memberId) => {
    const { rows: check } = await pool.query(
        'SELECT id FROM household_members WHERE household_id = $1 AND user_id = $2',
        [householdId, memberId]
    );
    if (check.length === 0) _fail(404, 'Üye bu hanede bulunamadı.');

    const { rows } = await pool.query(
        `SELECT id, source, amount, date, category, activity_type, created_at
         FROM emission_records
         WHERE user_id = $1
         ORDER BY date DESC`,
        [memberId]
    );
    return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. TASKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a task. If assigned_to is provided, verifies the assignee is in the household.
 * assigned_to = null means the task applies to the entire household.
 *
 * Optional tracking fields: emission_category, target_pct.
 * When both are present the service auto-computes baseline_period, baseline_amount,
 * and target_amount from actual emission_records.
 */
const createTask = async (householdId, adminId, { title, description, assigned_to, target_reduction, due_date, emission_category, target_pct }) => {
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle) _fail(400, 'Görev başlığı gereklidir.');

    const assignedTo = assigned_to ? parseInt(assigned_to, 10) : null;
    if (assignedTo) {
        const { rows } = await pool.query(
            'SELECT id FROM household_members WHERE household_id = $1 AND user_id = $2',
            [householdId, assignedTo]
        );
        if (rows.length === 0) _fail(400, 'Görev atanacak kullanıcı bu hanede bulunmuyor.');
    }

    const reduction = target_reduction ? parseFloat(target_reduction) : null;
    if (reduction !== null && (isNaN(reduction) || reduction <= 0)) {
        _fail(400, 'Hedef azaltım pozitif bir sayı olmalıdır.');
    }

    // ── Emission tracking (optional) ─────────────────────────────────────────
    const cleanCategory = typeof emission_category === 'string' && emission_category.trim()
        ? emission_category.trim() : null;
    const cleanPct = target_pct != null ? parseFloat(target_pct) : null;

    let baselinePeriod = null, baselineAmount = null, targetAmount = null;

    if (cleanCategory && cleanPct !== null && !isNaN(cleanPct) && cleanPct > 0 && cleanPct < 100) {
        const { rows: [rcRow] } = await pool.query(
            `SELECT COUNT(er.id)::int AS cnt
             FROM emission_records er
             JOIN household_members hm ON hm.user_id = er.user_id
             WHERE hm.household_id = $1`,
            [householdId]
        );
        if (rcRow.cnt === 0) {
            _fail(400, 'Takipli görev oluşturmak için önce en az bir emisyon kaydı girmelisiniz.');
        }

        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        baselinePeriod = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

        let bQuery, bParams;
        if (assignedTo) {
            bQuery  = `SELECT COALESCE(SUM(amount), 0)::float AS baseline
                       FROM emission_records
                       WHERE user_id = $1 AND category = $2 AND TO_CHAR(date, 'YYYY-MM') = $3`;
            bParams = [assignedTo, cleanCategory, baselinePeriod];
        } else {
            bQuery  = `SELECT COALESCE(SUM(er.amount), 0)::float AS baseline
                       FROM emission_records er
                       JOIN household_members hm ON hm.user_id = er.user_id
                       WHERE hm.household_id = $1 AND er.category = $2
                         AND TO_CHAR(er.date, 'YYYY-MM') = $3`;
            bParams = [householdId, cleanCategory, baselinePeriod];
        }

        const { rows: [bRow] } = await pool.query(bQuery, bParams);
        const rawBaseline = parseFloat(bRow.baseline);

        if (rawBaseline > 0) {
            // Previous month data exists — compute targets now
            baselineAmount = rawBaseline;
            targetAmount   = parseFloat((baselineAmount * (1 - cleanPct / 100)).toFixed(2));
        }
        // rawBaseline === 0: no previous data yet. Task is created with
        // baseline_amount = NULL, target_amount = NULL.
        // _addProgressToTasks will return 'no_baseline' at runtime.
    }

    const { rows: [task] } = await pool.query(
        `INSERT INTO household_tasks
             (household_id, assigned_by, assigned_to, title, description, target_reduction, due_date,
              emission_category, baseline_period, target_pct, baseline_amount, target_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
            householdId, adminId, assignedTo, trimmedTitle,
            typeof description === 'string' ? description.trim() || null : null,
            reduction, due_date || null,
            cleanCategory, baselinePeriod, cleanPct, baselineAmount, targetAmount,
        ]
    );
    return task;
};

/**
 * Augments a task list with live progress data for tasks that have emission tracking.
 * Uses a single batch query — no N+1 regardless of task count.
 *
 * Adds to each tracking task:
 *   current_amount  — kg CO₂e emitted this calendar month
 *   progress_status — 'on_track' | 'at_risk' | 'off_track' (prorated by day-of-month)
 */
const _addProgressToTasks = async (tasks, householdId) => {
    // Include all emission-tracked tasks, even those without a baseline yet
    const trackingTasks = tasks.filter(t => t.emission_category);
    if (!trackingTasks.length) return tasks;

    const { rows: emRows } = await pool.query(
        `SELECT er.category, er.user_id,
                COALESCE(SUM(er.amount), 0)::float AS current_amount
         FROM emission_records er
         JOIN household_members hm ON hm.user_id = er.user_id
         WHERE hm.household_id = $1
           AND TO_CHAR(er.date, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')
         GROUP BY er.category, er.user_id`,
        [householdId]
    );

    const emMap = {};
    emRows.forEach(row => {
        if (!emMap[row.category]) emMap[row.category] = { total: 0, byUser: {} };
        emMap[row.category].total += parseFloat(row.current_amount);
        emMap[row.category].byUser[row.user_id] =
            (emMap[row.category].byUser[row.user_id] || 0) + parseFloat(row.current_amount);
    });

    const now = new Date();
    const todayStr    = now.toISOString().split('T')[0];
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed  = now.getDate();

    const progressById = {};
    trackingTasks.forEach(t => {
        // Resolve current emission — null means "no records this period" (≠ zero emission)
        const catData = emMap[t.emission_category];
        let current;
        if (!catData) {
            current = null;
        } else if (t.assigned_to) {
            const userAmt = catData.byUser[t.assigned_to];
            current = userAmt !== undefined ? userAmt : null;
        } else {
            current = catData.total;
        }

        // No baseline/target yet — skip target logic, still surface any current data
        if (t.target_amount == null) {
            progressById[t.id] = {
                current_amount:  current !== null ? parseFloat(current.toFixed(2)) : null,
                progress_status: 'no_baseline',
            };
            return;
        }

        const target   = parseFloat(t.target_amount);
        const baseline = t.baseline_amount != null ? parseFloat(t.baseline_amount) : null;

        // Normalize due_date to a comparable YYYY-MM-DD string
        const dueStr = t.due_date
            ? (t.due_date instanceof Date
                ? t.due_date.toISOString().split('T')[0]
                : String(t.due_date).split('T')[0])
            : null;
        const deadlinePassed = dueStr && dueStr < todayStr;

        let progress_status;
        if (current === null) {
            // No emission records entered yet this period — not the same as achieving target
            progress_status = 'no_data';
        } else if (current <= target) {
            progress_status = 'successful';
        } else if (deadlinePassed) {
            progress_status = 'failed';
        } else {
            const expectedMax = target * (daysElapsed / daysInMonth);
            if (current <= expectedMax)              progress_status = 'on_track';
            else if (current <= expectedMax * 1.15)  progress_status = 'at_risk';
            else                                     progress_status = 'off_track';
        }

        progressById[t.id] = {
            current_amount:  current !== null ? parseFloat(current.toFixed(2)) : null,
            progress_status,
        };
    });

    return tasks.map(t => ({ ...t, ...(progressById[t.id] || {}) }));
};

/**
 * Returns all tasks for the household, with assignee and creator names joined in.
 * Tracking tasks include current_amount and progress_status.
 */
const getTasks = async (householdId) => {
    const { rows } = await pool.query(
        `SELECT
            ht.*,
            assignee.name AS assigned_to_name,
            creator.name  AS assigned_by_name
         FROM household_tasks ht
         LEFT JOIN users assignee ON assignee.id = ht.assigned_to
         JOIN  users creator      ON creator.id  = ht.assigned_by
         WHERE ht.household_id = $1
         ORDER BY ht.created_at DESC`,
        [householdId]
    );
    return _addProgressToTasks(rows, householdId);
};

/**
 * Updates the status of a task.
 * Admins can set any valid status freely.
 * Members can only advance their own assigned tasks one step forward
 * (pending → in_progress → completed). Household-wide tasks (assigned_to IS NULL)
 * are admin-only.
 */
const updateTaskStatus = async (householdId, taskId, status, userId, memberRole) => {
    const VALID = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!VALID.includes(status)) _fail(400, `Geçersiz durum. İzin verilenler: ${VALID.join(', ')}.`);

    if (memberRole !== 'admin') {
        const { rows: taskRows } = await pool.query(
            `SELECT assigned_to, status AS current_status
             FROM household_tasks
             WHERE id = $1 AND household_id = $2`,
            [taskId, householdId]
        );
        if (taskRows.length === 0) _fail(404, 'Görev bulunamadı.');

        const task = taskRows[0];

        if (task.assigned_to === null) {
            _fail(403, 'Tüm hane görevlerinin durumu yalnızca yönetici tarafından güncellenebilir.');
        }

        if (parseInt(task.assigned_to, 10) !== parseInt(userId, 10)) {
            _fail(403, 'Yalnızca size atanmış görevlerin durumunu güncelleyebilirsiniz.');
        }

        const TRANSITIONS = { pending: 'in_progress', in_progress: 'completed' };
        if (TRANSITIONS[task.current_status] !== status) {
            _fail(400, `Geçersiz durum geçişi. '${task.current_status}' durumundan yalnızca '${TRANSITIONS[task.current_status]}' durumuna geçilebilir.`);
        }
    }

    const { rows } = await pool.query(
        `UPDATE household_tasks
         SET status = $1
         WHERE id = $2 AND household_id = $3
         RETURNING *`,
        [status, taskId, householdId]
    );
    if (rows.length === 0) _fail(404, 'Görev bulunamadı.');
    return rows[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. EMISSION COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds an admin comment on a member's emission record.
 * member_user_id is derived from the emission record itself — never trusted from
 * the client — so the controller only needs to pass emissionRecordId.
 * Security check: verifies the record belongs to someone in this household.
 */
const addComment = async (emissionRecordId, householdId, adminId, rawComment) => {
    const comment = typeof rawComment === 'string' ? rawComment.trim() : '';
    if (!comment) _fail(400, 'Yorum boş olamaz.');

    // JOIN confirms: record exists AND its owner is in this household.
    // er.user_id becomes the member_user_id stored in emission_comments.
    const { rows } = await pool.query(
        `SELECT er.id, er.user_id AS member_id
         FROM emission_records er
         JOIN household_members hm ON hm.user_id = er.user_id
         WHERE er.id = $1
           AND hm.household_id = $2`,
        [emissionRecordId, householdId]
    );
    if (rows.length === 0) {
        _fail(404, 'Emisyon kaydı bulunamadı veya bu haneye ait değil.');
    }

    const memberId = rows[0].member_id;

    const { rows: [saved] } = await pool.query(
        `INSERT INTO emission_comments
             (emission_record_id, household_id, admin_user_id, member_user_id, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [emissionRecordId, householdId, adminId, memberId, comment]
    );
    return saved;
};

/**
 * Returns all comments on an emission record, scoped to the household.
 * Admins can read comments on any record in their household.
 * Members can only read comments on their own emission records.
 */
const getComments = async (emissionRecordId, householdId, userId, memberRole) => {
    if (memberRole !== 'admin') {
        const { rows: ownerCheck } = await pool.query(
            `SELECT id FROM emission_records WHERE id = $1 AND user_id = $2`,
            [emissionRecordId, userId]
        );
        if (ownerCheck.length === 0) {
            _fail(403, 'Bu emisyon kaydı size ait değil.');
        }
    }

    const { rows } = await pool.query(
        `SELECT ec.*, u.name AS admin_name
         FROM emission_comments ec
         JOIN users u ON u.id = ec.admin_user_id
         WHERE ec.emission_record_id = $1
           AND ec.household_id = $2
         ORDER BY ec.created_at ASC`,
        [emissionRecordId, householdId]
    );
    return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. HOUSEHOLD COMPARISON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns internal household comparison data:
 *   - Per-member emissions for the current month
 *   - Current vs previous month totals
 *   - Task status summary
 * No cross-household data is used.
 */
const getHouseholdComparison = async (householdId) => {
    const [memberRes, currRes, prevRes, taskRes] = await Promise.all([
        pool.query(
            `SELECT u.name, u.id AS user_id,
                    COALESCE(SUM(er.amount), 0)::float AS current_month_emissions
             FROM household_members hm
             JOIN users u ON u.id = hm.user_id
             LEFT JOIN emission_records er ON er.user_id = hm.user_id
                 AND TO_CHAR(er.date, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')
             WHERE hm.household_id = $1
             GROUP BY u.id, u.name
             ORDER BY current_month_emissions DESC`,
            [householdId]
        ),
        pool.query(
            `SELECT COALESCE(SUM(er.amount), 0)::float AS total
             FROM household_members hm
             JOIN emission_records er ON er.user_id = hm.user_id
             WHERE hm.household_id = $1
               AND TO_CHAR(er.date, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`,
            [householdId]
        ),
        pool.query(
            `SELECT COALESCE(SUM(er.amount), 0)::float AS total
             FROM household_members hm
             JOIN emission_records er ON er.user_id = hm.user_id
             WHERE hm.household_id = $1
               AND TO_CHAR(er.date, 'YYYY-MM') = TO_CHAR(NOW() - INTERVAL '1 month', 'YYYY-MM')`,
            [householdId]
        ),
        pool.query(
            `SELECT status, COUNT(*)::int AS count
             FROM household_tasks
             WHERE household_id = $1
             GROUP BY status`,
            [householdId]
        ),
    ]);

    const currentTotal  = parseFloat(currRes.rows[0].total);
    const previousTotal = parseFloat(prevRes.rows[0].total);

    const monthChangePct = previousTotal > 0
        ? parseFloat(((currentTotal - previousTotal) / previousTotal * 100).toFixed(1))
        : null;

    const taskMap = {};
    taskRes.rows.forEach(r => { taskMap[r.status] = r.count; });

    const hasData = memberRes.rows.some(m => m.current_month_emissions > 0)
        || currentTotal > 0
        || previousTotal > 0;

    return {
        comparison_available: hasData,
        member_breakdown:     memberRes.rows,
        current_month_total:  parseFloat(currentTotal.toFixed(2)),
        previous_month_total: parseFloat(previousTotal.toFixed(2)),
        month_change_pct:     monthChangePct,
        task_stats: {
            pending:     taskMap['pending']     || 0,
            in_progress: taskMap['in_progress'] || 0,
            completed:   taskMap['completed']   || 0,
        },
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    getUserMembership,
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
