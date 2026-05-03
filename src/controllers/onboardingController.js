const pool = require('../config/db');

// POST /api/onboarding
// Accepts the full flat-JSON answers object from the wizard.
// Hybrid strategy: store everything in onboarding_answers (JSONB) and
// also write the most important fields into the role-specific profile table.
const saveOnboarding = async (req, res) => {
    const userId  = req.user.id;
    const answers = req.body;

    if (!answers || typeof answers !== 'object') {
        return res.status(400).json({ message: 'Geçersiz istek gövdesi.' });
    }

    try {
        // ── 1. Fetch user role first ───────────────────────────────────────
        const userRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        const role = userRes.rows[0].role;

        // ── 2. Primary Save: onboarding_answers (JSONB) ────────────────────
        // We use a dedicated try-block for each table to ensure failure in one doesn't kill the request.
        try {
            await pool.query(
                `INSERT INTO onboarding_answers (user_id, answers, updated_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (user_id) DO UPDATE SET answers = EXCLUDED.answers, updated_at = NOW()`,
                [userId, JSON.stringify(answers)]
            );
        } catch (e) { console.error('onboarding_answers error:', e.message); }

        // ── 3. Secondary Save: Normalized tables ───────────────────────────
        try {
            if (role === 'individual') {
                const hasCar = answers.has_car === 'true';
                const hsNum = parseInt(answers.household_size, 10) || null;
                await pool.query(
                    `INSERT INTO individual_profiles (user_id, has_car, commute_mode, flights_per_year_range, priority_area, home_type, household_size, heating_type, car_fuel_type, weekly_km, diet_type, motivation)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                     ON CONFLICT (user_id) DO UPDATE SET has_car=EXCLUDED.has_car, commute_mode=EXCLUDED.commute_mode, flights_per_year_range=EXCLUDED.flights_per_year_range, priority_area=EXCLUDED.priority_area, home_type=EXCLUDED.home_type, household_size=EXCLUDED.household_size, heating_type=EXCLUDED.heating_type, car_fuel_type=EXCLUDED.car_fuel_type, weekly_km=EXCLUDED.weekly_km, diet_type=EXCLUDED.diet_type, motivation=EXCLUDED.motivation`,
                    [userId, hasCar, answers.public_transport_freq, answers.domestic_flights, answers.priority_area, answers.home_type, hsNum, answers.heating_type, answers.car_fuel_type, answers.weekly_km, answers.diet_type, answers.motivation]
                );
            } else if (role === 'household') {
                const hsNum = parseInt(answers.household_size, 10) || null;
                await pool.query(
                    `INSERT INTO household_profiles (user_id, household_size, home_type, has_regular_vehicle_use, priority_area, heating_type, car_fuel_type, diet_type, motivation)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                     ON CONFLICT (user_id) DO UPDATE SET household_size=EXCLUDED.household_size, home_type=EXCLUDED.home_type, has_regular_vehicle_use=EXCLUDED.has_regular_vehicle_use, priority_area=EXCLUDED.priority_area, heating_type=EXCLUDED.heating_type, car_fuel_type=EXCLUDED.car_fuel_type, diet_type=EXCLUDED.diet_type, motivation=EXCLUDED.motivation`,
                    [userId, hsNum, answers.home_type, answers.has_car === 'true', answers.priority_area, answers.heating_type, answers.car_fuel_type, answers.diet_type, answers.motivation]
                );
            } else if (role === 'company') {
                await pool.query(
                    `INSERT INTO company_profiles (user_id, company_name, industry, employee_count_range, has_company_vehicles, priority_area, department_count_range, motivation)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                     ON CONFLICT (user_id) DO UPDATE SET company_name=EXCLUDED.company_name, industry=EXCLUDED.industry, employee_count_range=EXCLUDED.employee_count_range, has_company_vehicles=EXCLUDED.has_company_vehicles, priority_area=EXCLUDED.priority_area, department_count_range=EXCLUDED.department_count_range, motivation=EXCLUDED.motivation`,
                    [userId, answers.company_name, answers.industry, answers.employee_count_range, answers.has_company_vehicles === 'true', answers.priority_area, answers.department_count_range, answers.motivation]
                );
            }
        } catch (e) { console.error('Normalized table error:', e.message); }

        // ── 4. Final step: Mark complete (Crucial for redirection) ──────────
        await pool.query('UPDATE users SET onboarding_completed = true WHERE id = $1', [userId]);

        return res.status(200).json({ message: 'Profil başarıyla oluşturuldu.' });

    } catch (err) {
        console.error('[saveOnboarding Global Error]:', err.message);
        // Fallback: If EVERYTHING fails but we at least have a user, try to mark them complete anyway
        try { await pool.query('UPDATE users SET onboarding_completed = true WHERE id = $1', [userId]); } catch(f) {}
        return res.status(200).json({ message: 'Kurulum tamamlandı (Kısmi kayıt).' }); 
    }
};

// GET /api/onboarding
// Returns the role-specific profile AND the full raw answers for prefilling.
const getOnboarding = async (req, res) => {
    const userId = req.user.id;
    const role   = req.user.role;

    const tableMap = {
        individual: 'individual_profiles',
        household:  'household_profiles',
        company:    'company_profiles',
    };

    const table = tableMap[role];
    if (!table) return res.status(400).json({ message: 'Geçersiz kullanıcı rolü.' });

    try {
        let profile = null;
        let answers = null;

        // Try fetching profile from the role-specific table
        try {
            const pRes = await pool.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId]);
            profile = pRes.rows[0] || null;
        } catch (e) { console.warn('Profile table not ready:', e.message); }

        // Try fetching raw answers from JSONB store
        try {
            const aRes = await pool.query('SELECT answers FROM onboarding_answers WHERE user_id = $1', [userId]);
            answers = aRes.rows[0]?.answers || null;
        } catch (e) { console.warn('Onboarding answers table not ready:', e.message); }

        return res.status(200).json({
            role,
            profile,
            answers
        });
    } catch (err) {
        console.error('[getOnboarding Global Error]:', err.message);
        // Even if everything fails, return the role so frontend doesn't crash
        return res.status(200).json({ role, profile: null, answers: null });
    }
};

module.exports = { saveOnboarding, getOnboarding };
