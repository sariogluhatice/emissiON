const pool = require('../config/db');

// POST /api/onboarding
const saveOnboarding = async (req, res) => {
    const userId = req.user.id;

    try {
        const userResult = await pool.query(
            'SELECT role FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        const role = userResult.rows[0].role;

        if (role === 'individual') {
            const { has_car, commute_mode, flights_per_year_range, lives_alone, priority_area } = req.body;

            await pool.query(
                `INSERT INTO individual_profiles
                    (user_id, has_car, commute_mode, flights_per_year_range, lives_alone, priority_area)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (user_id) DO UPDATE SET
                     has_car                = EXCLUDED.has_car,
                     commute_mode           = EXCLUDED.commute_mode,
                     flights_per_year_range = EXCLUDED.flights_per_year_range,
                     lives_alone            = EXCLUDED.lives_alone,
                     priority_area          = EXCLUDED.priority_area`,
                [
                    userId,
                    has_car                ?? null,
                    commute_mode           ?? null,
                    flights_per_year_range ?? null,
                    lives_alone            ?? null,
                    priority_area          ?? null,
                ]
            );

        } else if (role === 'household') {
            const { household_size, home_type, has_regular_vehicle_use, data_entry_preference, priority_area } = req.body;

            await pool.query(
                `INSERT INTO household_profiles
                    (user_id, household_size, home_type, has_regular_vehicle_use, data_entry_preference, priority_area)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (user_id) DO UPDATE SET
                     household_size          = EXCLUDED.household_size,
                     home_type               = EXCLUDED.home_type,
                     has_regular_vehicle_use = EXCLUDED.has_regular_vehicle_use,
                     data_entry_preference   = EXCLUDED.data_entry_preference,
                     priority_area           = EXCLUDED.priority_area`,
                [
                    userId,
                    household_size          ?? null,
                    home_type               ?? null,
                    has_regular_vehicle_use ?? null,
                    data_entry_preference   ?? null,
                    priority_area           ?? null,
                ]
            );

        } else if (role === 'company') {
            const { company_name, industry, employee_count_range, has_company_vehicles, priority_area } = req.body;

            await pool.query(
                `INSERT INTO company_profiles
                    (user_id, company_name, industry, employee_count_range, has_company_vehicles, priority_area)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (user_id) DO UPDATE SET
                     company_name         = EXCLUDED.company_name,
                     industry             = EXCLUDED.industry,
                     employee_count_range = EXCLUDED.employee_count_range,
                     has_company_vehicles = EXCLUDED.has_company_vehicles,
                     priority_area        = EXCLUDED.priority_area`,
                [
                    userId,
                    company_name         ?? null,
                    industry             ?? null,
                    employee_count_range ?? null,
                    has_company_vehicles ?? null,
                    priority_area        ?? null,
                ]
            );

        } else {
            return res.status(400).json({ message: 'Geçersiz kullanıcı rolü.' });
        }

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
        const result = await pool.query(
            `SELECT * FROM ${table} WHERE user_id = $1`,
            [userId]
        );

        return res.status(200).json({
            role,
            profile: result.rows[0] ?? null,
        });
    } catch (err) {
        console.error('[onboarding.getOnboarding] code:', err.code, '| message:', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

module.exports = { saveOnboarding, getOnboarding };
