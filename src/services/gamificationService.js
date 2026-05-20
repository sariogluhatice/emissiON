const pool = require('../config/db');

// ── Level thresholds (cumulative XP required for each level) ─────────────────
// Index 0 = level 1, index 9 = level 10
const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

// ── Event definitions ─────────────────────────────────────────────────────────
// dailyLimit: max times per calendar day (null = unlimited)
// lifetimeLimit: max times ever (null = unlimited)
const EVENT_DEFS = {
    emission_entry_created:   { xp: 40,  dailyLimit: 3,    lifetimeLimit: null },
    ocr_invoice_processed:    { xp: 60,  dailyLimit: 2,    lifetimeLimit: null },
    carbon_profile_completed: { xp: 100, dailyLimit: null, lifetimeLimit: 1    },
    carbon_profile_updated:   { xp: 30,  dailyLimit: 1,    lifetimeLimit: null },
    what_if_simulation_used:  { xp: 25,  dailyLimit: 2,    lifetimeLimit: null },
    household_task_completed: { xp: 80,  dailyLimit: 3,    lifetimeLimit: null },
    reduction_goal_achieved:  { xp: 150, monthlyLimit: 1,  lifetimeLimit: null },
    daily_streak_bonus:       { xp: 20,  dailyLimit: 1,    lifetimeLimit: null },
};

const BADGE_DEFS = [
    { id: 'earth_friend',  name: 'Dünya Dostu',       icon: '🌍', xp: 25,  check: ()           => true },
    { id: 'first_step',   name: 'İlk Adım',           icon: '🌱', xp: 50,  check: s => s.total_entries >= 1 },
    { id: 'data_pro',     name: 'Veri Ustası',         icon: '📊', xp: 100, check: s => s.total_entries >= 5 },
    { id: 'data_expert',  name: 'Analiz Uzmanı',       icon: '🔬', xp: 200, check: s => s.total_entries >= 20 },
    { id: 'streak_3',     name: '3 Günlük Seri',       icon: '🔥', xp: 75,  check: s => s.longest_streak >= 3 },
    { id: 'streak_7',     name: 'Haftalık Şampiyon',   icon: '⭐', xp: 150, check: s => s.longest_streak >= 7 },
    { id: 'streak_14',    name: 'İstikrarlı (14 Gün)', icon: '⏳', xp: 300, check: s => s.longest_streak >= 14 },
    { id: 'streak_30',    name: 'Aylık Efsane',        icon: '🚀', xp: 500, check: s => s.longest_streak >= 30 },
    { id: 'carbon_aware', name: 'Karbon Bilinçli',     icon: '♻️', xp: 75,  check: s => s.total_xp >= 300 },
    { id: 'eco_warrior',  name: 'Eko Savaşçı (Sv.5)',  icon: '🛡️', xp: 250, check: s => s.level >= 5 },
];

// ── Level helpers ─────────────────────────────────────────────────────────────
function computeLevel(xp) {
    let level = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
        if (xp >= LEVEL_THRESHOLDS[i]) { level = i + 1; break; }
    }
    return level; // max 10
}

function levelProgressInfo(xp) {
    const level           = computeLevel(xp);
    const currentLevelXp  = LEVEL_THRESHOLDS[level - 1] ?? 0;
    const nextLevelXp     = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const xpInLevel       = xp - currentLevelXp;
    const xpNeeded        = nextLevelXp - currentLevelXp;
    const progressPercent = level >= LEVEL_THRESHOLDS.length
        ? 100
        : Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));
    return {
        level,
        currentLevelXp,
        nextLevelXp,
        progressPercent,
        xpToNextLevel: Math.max(0, nextLevelXp - xp),
    };
}

const _toDateStr = (d) => {
    if (!d) return null;
    if (typeof d === 'string') return d.slice(0, 10);
    return d.toISOString().slice(0, 10);
};

const _buildStats = (gam) => {
    const info = levelProgressInfo(gam.total_xp);
    return {
        streak:         gam.current_streak,
        longest_streak: gam.longest_streak,
        totalXp:        gam.total_xp,
        level:          info.level,
        currentLevelXp: info.currentLevelXp,
        nextLevelXp:    info.nextLevelXp,
        progressPercent: info.progressPercent,
        xpToNextLevel:  info.xpToNextLevel,
    };
};

// ── getStats ──────────────────────────────────────────────────────────────────
const getStats = async (userId) => {
    const { rows } = await pool.query(
        'SELECT * FROM user_gamification WHERE user_id = $1',
        [userId]
    );
    const gam = rows[0] || { current_streak: 0, longest_streak: 0, total_xp: 0, level: 1, badges: [] };
    const earnedIds = new Set(gam.badges || []);
    return {
        ..._buildStats(gam),
        badge_defs: BADGE_DEFS.map(b => ({
            id: b.id, name: b.name, icon: b.icon, earned: earnedIds.has(b.id),
        })),
    };
};

// ── awardXp ───────────────────────────────────────────────────────────────────
// Central XP-award function. All gamification flows go through here.
const awardXp = async (userId, eventType) => {
    const def = EVENT_DEFS[eventType];
    if (!def) return { xpGained: 0, newBadges: [], leveledUp: false, stats: null };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get or create gamification row
        let { rows } = await client.query(
            'SELECT * FROM user_gamification WHERE user_id = $1 FOR UPDATE',
            [userId]
        );
        let gam = rows[0];
        if (!gam) {
            const ins = await client.query(
                'INSERT INTO user_gamification (user_id) VALUES ($1) RETURNING *',
                [userId]
            );
            gam = ins.rows[0];
        }

        const today    = new Date().toISOString().slice(0, 10);
        const lastDate = _toDateStr(gam.last_entry_date);

        // ── Streak (only on emission_entry_created, first entry of the day) ──
        let newStreak       = gam.current_streak;
        let longestStreak   = gam.longest_streak;
        let newLastEntryDate = gam.last_entry_date;
        let streakBonusXp   = 0;
        const isFirstEntryToday = (eventType === 'emission_entry_created') && (lastDate !== today);

        if (isFirstEntryToday) {
            const yest = new Date();
            yest.setDate(yest.getDate() - 1);
            const yesterdayStr = yest.toISOString().slice(0, 10);
            newStreak        = lastDate === yesterdayStr ? gam.current_streak + 1 : 1;
            longestStreak    = Math.max(newStreak, gam.longest_streak);
            newLastEntryDate = today;

            // Auto-award streak bonus if streak continued
            if (newStreak > 1) {
                const { rows: sRows } = await client.query(
                    `SELECT COUNT(*)::int AS cnt FROM gamification_events
                     WHERE user_id = $1 AND event_type = 'daily_streak_bonus'
                       AND created_at >= $2::date AND created_at < ($2::date + interval '1 day')`,
                    [userId, today]
                );
                if (sRows[0].cnt < EVENT_DEFS.daily_streak_bonus.dailyLimit) {
                    streakBonusXp = EVENT_DEFS.daily_streak_bonus.xp;
                    await client.query(
                        'INSERT INTO gamification_events (user_id, event_type, xp_awarded) VALUES ($1, $2, $3)',
                        [userId, 'daily_streak_bonus', streakBonusXp]
                    );
                }
            }
        }

        // ── Check limits for the main event ──────────────────────────────────
        let mainXp = 0;
        let canAward = true;

        if (def.lifetimeLimit !== null) {
            const { rows: ltRows } = await client.query(
                'SELECT COUNT(*)::int AS cnt FROM gamification_events WHERE user_id = $1 AND event_type = $2',
                [userId, eventType]
            );
            if (ltRows[0].cnt >= def.lifetimeLimit) canAward = false;
        }

        if (canAward && def.dailyLimit !== null) {
            const { rows: dRows } = await client.query(
                `SELECT COUNT(*)::int AS cnt FROM gamification_events
                 WHERE user_id = $1 AND event_type = $2
                   AND created_at >= $3::date AND created_at < ($3::date + interval '1 day')`,
                [userId, eventType, today]
            );
            if (dRows[0].cnt >= def.dailyLimit) canAward = false;
        }

        if (canAward && def.monthlyLimit !== undefined && def.monthlyLimit !== null) {
            const currentMonth = today.slice(0, 7); // 'YYYY-MM'
            const { rows: mRows } = await client.query(
                `SELECT COUNT(*)::int AS cnt FROM gamification_events
                 WHERE user_id = $1 AND event_type = $2
                   AND to_char(created_at, 'YYYY-MM') = $3`,
                [userId, eventType, currentMonth]
            );
            if (mRows[0].cnt >= def.monthlyLimit) canAward = false;
        }

        if (canAward) {
            mainXp = def.xp;
            await client.query(
                'INSERT INTO gamification_events (user_id, event_type, xp_awarded) VALUES ($1, $2, $3)',
                [userId, eventType, mainXp]
            );
        }

        const totalXpGained = mainXp + streakBonusXp;

        // Nothing changed — rollback and return current stats
        if (totalXpGained === 0 && !isFirstEntryToday) {
            await client.query('ROLLBACK');
            return { xpGained: 0, newBadges: [], leveledUp: false, stats: _buildStats(gam) };
        }

        // ── Badge check ───────────────────────────────────────────────────────
        const { rows: entRows } = await client.query(
            'SELECT COUNT(*)::int AS cnt FROM emission_records WHERE user_id = $1',
            [userId]
        );
        const totalEntries = entRows[0].cnt;
        const earnedIds = new Set(gam.badges || []);
        const newBadges = [];
        let badgeXp = 0;
        const checkStats = {
            total_entries:   totalEntries,
            longest_streak:  longestStreak,
            total_xp:        gam.total_xp + totalXpGained,
            level:           computeLevel(gam.total_xp + totalXpGained),
        };
        for (const b of BADGE_DEFS) {
            if (!earnedIds.has(b.id) && b.check(checkStats)) {
                newBadges.push({ id: b.id, name: b.name, icon: b.icon });
                earnedIds.add(b.id);
                badgeXp += b.xp;
            }
        }

        // ── Compute new totals & persist ──────────────────────────────────────
        const oldLevel = computeLevel(gam.total_xp);
        const newXp    = gam.total_xp + totalXpGained + badgeXp;
        const newLevel = computeLevel(newXp);

        await client.query(
            `UPDATE user_gamification
             SET current_streak  = $2,
                 longest_streak  = $3,
                 last_entry_date = $4,
                 total_xp        = $5,
                 level           = $6,
                 badges          = $7,
                 updated_at      = NOW()
             WHERE user_id = $1`,
            [userId, newStreak, longestStreak, newLastEntryDate, newXp, newLevel,
             JSON.stringify([...earnedIds])]
        );

        await client.query('COMMIT');

        const info = levelProgressInfo(newXp);
        return {
            xpGained:  totalXpGained + badgeXp,
            newBadges,
            leveledUp: newLevel > oldLevel,
            stats: {
                streak:          newStreak,
                longest_streak:  longestStreak,
                totalXp:         newXp,
                level:           info.level,
                currentLevelXp:  info.currentLevelXp,
                nextLevelXp:     info.nextLevelXp,
                progressPercent: info.progressPercent,
                xpToNextLevel:   info.xpToNextLevel,
            },
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// ── processEntry — backward-compat alias ─────────────────────────────────────
const processEntry = (userId) => awardXp(userId, 'emission_entry_created');

module.exports = { getStats, awardXp, processEntry };
