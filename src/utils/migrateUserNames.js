/**
 * One-time migration: normalize all existing user names to title case
 * with proper Turkish character handling.
 *
 * Usage:
 *   node src/utils/migrateUserNames.js
 *
 * Set DATABASE_URL or configure src/config/db.js before running.
 * The script is idempotent — running it multiple times is safe.
 */

const pool = require('../config/db');
const { normalizeName } = require('./nameUtils');

async function run() {
    const { rows: users } = await pool.query(
        'SELECT id, name FROM users WHERE name IS NOT NULL AND name <> \'\''
    );

    let updated = 0;
    let skipped = 0;

    for (const user of users) {
        const normalized = normalizeName(user.name);
        if (normalized === user.name) {
            skipped++;
            continue;
        }
        await pool.query('UPDATE users SET name = $1 WHERE id = $2', [normalized, user.id]);
        console.log(`[${user.id}] "${user.name}" → "${normalized}"`);
        updated++;
    }

    console.log(`\nDone. Updated: ${updated}, already normalized: ${skipped}.`);
    await pool.end();
}

run().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
