const pool = require('../config/db');

// POST /api/onboarding
// Accepts the full flat-JSON answers object from the wizard.
// Hybrid strategy: store everything in onboarding_answers (JSONB) and
// also write the most important fields into the role-specific profile table.
const saveOnboarding = async (req, res) => {
    const userId  = req.user.id;
    const answers = req.body; // flat key→value object from the wizard

    if (!answers || typeof answers !== 'object') {
        return res.status(400).json({ message: 'Geçersiz istek gövdesi.' });
    }

    try {
        const userResult = await pool.query(
            'SELECT role FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        const role = userResult.rows[0].role;

        // ── 1. Store the full answers as JSONB ─────────────────────────────
        await pool.query(
            `INSERT INTO onboarding_answers (user_id, answers, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) DO UPDATE
               SET answers    = EXCLUDED.answers,
                   updated_at = NOW()`,
            [userId, JSON.stringify(answers)]
        );

        // ── 2. Write normalized fields into the role-specific profile table ─
        if (role === 'individual') {
            const hasCar = answers.has_car === 'true' ? true
                         : answers.has_car === 'false' ? false
                         : null;

            const livesAlone = answers.household_size === '1' ? true
                             : answers.household_size           ? false
                             : null;

            const hsNum = answers.household_size && answers.household_size !== '6+'
                ? parseInt(answers.household_size, 10) || null
                : null;

            await pool.query(
                `INSERT INTO individual_profiles
                     (user_id, has_car, commute_mode, flights_per_year_range, lives_alone,
                      priority_area, home_type, household_size, heating_type,
                      car_fuel_type, weekly_km, diet_type, motivation)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                 ON CONFLICT (user_id) DO UPDATE SET
                     has_car                = EXCLUDED.has_car,
                     commute_mode           = EXCLUDED.commute_mode,
                     flights_per_year_range = EXCLUDED.flights_per_year_range,
                     lives_alone            = EXCLUDED.lives_alone,
                     priority_area          = EXCLUDED.priority_area,
                     home_type              = EXCLUDED.home_type,
                     household_size         = EXCLUDED.household_size,
                     heating_type           = EXCLUDED.heating_type,
                     car_fuel_type          = EXCLUDED.car_fuel_type,
                     weekly_km              = EXCLUDED.weekly_km,
                     diet_type              = EXCLUDED.diet_type,
                     motivation             = EXCLUDED.motivation`,
                [
                    userId,
                    hasCar,
                    answers.public_transport_freq ?? null,
                    answers.domestic_flights       ?? null,
                    livesAlone,
                    answers.priority_area          ?? null,
                    answers.home_type              ?? null,
                    hsNum,
                    answers.heating_type           ?? null,
                    hasCar ? (answers.car_fuel_type ?? null) : null,
                    hasCar ? (answers.weekly_km     ?? null) : null,
                    answers.diet_type              ?? null,
                    answers.motivation             ?? null,
                ]
            );

        } else if (role === 'household') {
            const hasVehicle = answers.has_car === 'true' ? true
                             : answers.has_car === 'false' ? false
                             : null;

            const hsNum = answers.household_size && answers.household_size !== '6+'
                ? parseInt(answers.household_size, 10) || null
                : null;

            await pool.query(
                `INSERT INTO household_profiles
                     (user_id, household_size, home_type, has_regular_vehicle_use,
                      data_entry_preference, priority_area, heating_type,
                      car_fuel_type, diet_type, motivation)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (user_id) DO UPDATE SET
                     household_size          = EXCLUDED.household_size,
                     home_type               = EXCLUDED.home_type,
                     has_regular_vehicle_use = EXCLUDED.has_regular_vehicle_use,
                     data_entry_preference   = EXCLUDED.data_entry_preference,
                     priority_area           = EXCLUDED.priority_area,
                     heating_type            = EXCLUDED.heating_type,
                     car_fuel_type           = EXCLUDED.car_fuel_type,
                     diet_type               = EXCLUDED.diet_type,
                     motivation              = EXCLUDED.motivation`,
                [
                    userId,
                    hsNum,
                    answers.home_type              ?? null,
                    hasVehicle,
                    'manual',
                    answers.priority_area          ?? null,
                    answers.heating_type           ?? null,
                    hasVehicle ? (answers.car_fuel_type ?? null) : null,
                    answers.diet_type              ?? null,
                    answers.motivation             ?? null,
                ]
            );

        } else if (role === 'company') {
            const hasVehicles = answers.has_company_vehicles === 'true' ? true
                              : answers.has_company_vehicles === 'false' ? false
                              : null;

            await pool.query(
                `INSERT INTO company_profiles
                     (user_id, company_name, industry, employee_count_range,
                      has_company_vehicles, priority_area, department_count_range, motivation)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT (user_id) DO UPDATE SET
                     company_name            = EXCLUDED.company_name,
                     industry                = EXCLUDED.industry,
                     employee_count_range    = EXCLUDED.employee_count_range,
                     has_company_vehicles    = EXCLUDED.has_company_vehicles,
                     priority_area           = EXCLUDED.priority_area,
                     department_count_range  = EXCLUDED.department_count_range,
                     motivation              = EXCLUDED.motivation`,
                [
                    userId,
                    answers.company_name           ?? null,
                    answers.industry               ?? null,
                    answers.employee_count_range   ?? null,
                    hasVehicles,
                    answers.priority_area          ?? null,
                    answers.department_count_range ?? null,
                    answers.motivation             ?? null,
                ]
            );

        } else {
            return res.status(400).json({ message: 'Geçersiz kullanıcı rolü.' });
        }

        // ── 3. Mark onboarding complete ────────────────────────────────────
        await pool.query(
            'UPDATE users SET onboarding_completed = true WHERE id = $1',
            [userId]
        );

        return res.status(200).json({ message: 'Profil kaydedildi.' });

    } catch (err) {
        console.error('[onboarding.saveOnboarding] code:', err.code, '| message:', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
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
    if (!table) {
        return res.status(400).json({ message: 'Geçersiz kullanıcı rolü.' });
    }

    try {
        const [profileResult, answersResult] = await Promise.all([
            pool.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId]),
            pool.query('SELECT answers FROM onboarding_answers WHERE user_id = $1', [userId]),
        ]);

        return res.status(200).json({
            role,
            profile: profileResult.rows[0]  ?? null,
            answers: answersResult.rows[0]?.answers ?? null,
        });
    } catch (err) {
        console.error('[onboarding.getOnboarding] code:', err.code, '| message:', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

module.exports = { saveOnboarding, getOnboarding };
