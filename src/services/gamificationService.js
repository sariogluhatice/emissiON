const pool = require('../config/db');

// XP required to reach each level (index = level - 1)
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3100, 4300, 6000];

const BADGE_DEFS = [
    { id: 'earth_friend',  name: 'Dünya Dostu',       icon: '🌍', xp: 25,  check: ()           => true },
    { id: 'first_step',   name: 'İlk Adım',           icon: '🌱', xp: 50,  check: s => s.total_entries >= 1 },
    { id: 'data_pro',     name: 'Veri Ustası',         icon: '📊', xp: 100, check: s => s.total_entries >= 5 },
    { id: 'data_expert',  name: 'Analiz Uzmanı',       icon: '🔬', xp: 200, check: s => s.total_entries >= 20 },
    { id: 'streak_3',     name: '3 Günlük Seri',       icon: '🔥', xp: 75,  check: s => s.longest_streak >= 3 },
    { id: 'streak_7',     name: 'Haftalık Şampiyon',   icon: '⭐', xp: 150, check: s => s.longest_streak >= 7 },
    { id: 'streak_30',    name: 'Aylık Efsane',        icon: '🚀', xp: 500, check: s => s.longest_streak >= 30 },
    { id: 'carbon_aware', name: 'Karbon Bilinçli',     icon: '♻️', xp: 75,  check: s => s.total_xp >= 300 },
];

function computeLevel(xp) {
    let level = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
        if (xp >= LEVEL_THRESHOLDS[i]) { level = i + 1; break; }
    }
    return Math.min(level, 10);
}

function levelProgressInfo(xp) {
    const level = computeLevel(xp);
    const currentLevelXp = LEVEL_THRESHOLDS[level - 1] ?? 0;
    const nextLevelXp    = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const xpInLevel  = xp - currentLevelXp;
    const xpNeeded   = nextLevelXp - currentLevelXp;
    const progress   = level >= 10 ? 100 : Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));
    return { level, progress, xpToNext: Math.max(0, nextLevelXp - xp) };
}

const _toDateStr = (d) => {
    if (!d) return null;
    if (typeof d === 'string') return d.slice(0, 10);
    return d.toISOString().slice(0, 10);
};

const getStats = async (userId) => {
    const { rows } = await pool.query(
        'SELECT * FROM user_gamification WHERE user_id = $1',
        [userId]
    );

    const gam = rows[0] || { current_streak: 0, longest_streak: 0, total_xp: 0, level: 1, badges: [] };
    const { level, progress, xpToNext } = levelProgressInfo(gam.total_xp);

    const earnedIds = new Set(gam.badges || []);
    return {
        current_streak:    gam.current_streak,
        longest_streak:    gam.longest_streak,
        total_xp:          gam.total_xp,
        level,
        level_progress_pct: progress,
        xp_to_next_level:  xpToNext,
        badge_defs: BADGE_DEFS.map(b => ({
            id: b.id, name: b.name, icon: b.icon, earned: earnedIds.has(b.id),
        })),
    };
};

const processEntry = async (userId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get or create record
        let { rows } = await client.query(
            'SELECT * FROM user_gamification WHERE user_id = $1 FOR UPDATE',
            [userId]
        );
        let gam;
        if (rows.length === 0) {
            const ins = await client.query(
                'INSERT INTO user_gamification (user_id) VALUES ($1) RETURNING *',
                [userId]
            );
            gam = ins.rows[0];
        } else {
            gam = rows[0];
        }

        const today = new Date().toISOString().slice(0, 10);
        const lastDate = _toDateStr(gam.last_entry_date);

        if (lastDate === today) {
            await client.query('ROLLBACK');
            const { level, progress, xpToNext } = levelProgressInfo(gam.total_xp);
            return {
                xpGained: 0, newBadges: [], leveledUp: false,
                stats: { current_streak: gam.current_streak, total_xp: gam.total_xp, level, level_progress_pct: progress, xp_to_next_level: xpToNext },
            };
        }

        // Streak
        const yest = new Date(); yest.setDate(yest.getDate() - 1);
        const yesterdayStr = yest.toISOString().slice(0, 10);
        const newStreak    = lastDate === yesterdayStr ? gam.current_streak + 1 : 1;
        const longestStreak = Math.max(newStreak, gam.longest_streak);

        // XP
        const baseXp    = 50;
        const streakXp  = Math.min(newStreak * 5, 150);

        // Entry count
        const { rows: entRows } = await client.query(
            'SELECT COUNT(*)::int AS cnt FROM emission_records WHERE user_id = $1',
            [userId]
        );
        const totalEntries = entRows[0].cnt;
        const milestoneXp  = { 5: 50, 10: 100, 25: 200, 50: 300, 100: 500 }[totalEntries] ?? 0;

        // Badges
        const earnedIds = new Set(gam.badges || []);
        const newBadges = [];
        let badgeXp = 0;
        const checkStats = { total_entries: totalEntries, longest_streak: longestStreak, total_xp: gam.total_xp };
        for (const b of BADGE_DEFS) {
            if (!earnedIds.has(b.id) && b.check(checkStats)) {
                newBadges.push({ id: b.id, name: b.name, icon: b.icon });
                earnedIds.add(b.id);
                badgeXp += b.xp;
            }
        }

        const xpGained  = baseXp + streakXp + milestoneXp + badgeXp;
        const oldLevel  = computeLevel(gam.total_xp);
        const newXp     = gam.total_xp + xpGained;
        const newLevel  = computeLevel(newXp);

        await client.query(
            `UPDATE user_gamification
             SET current_streak = $2, longest_streak = $3, last_entry_date = $4,
                 total_xp = $5, level = $6, badges = $7, updated_at = NOW()
             WHERE user_id = $1`,
            [userId, newStreak, longestStreak, today, newXp, newLevel, JSON.stringify([...earnedIds])]
        );

        await client.query('COMMIT');

        const { level: lvl, progress, xpToNext } = levelProgressInfo(newXp);
        return {
            xpGained,
            newBadges,
            leveledUp: newLevel > oldLevel,
            stats: { current_streak: newStreak, total_xp: newXp, level: lvl, level_progress_pct: progress, xp_to_next_level: xpToNext },
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { getStats, processEntry };
