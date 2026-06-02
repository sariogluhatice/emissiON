const pool           = require('../config/db');
const PROFILE_TABLES = require('../utils/profileTables');

const getCarbonProfile = async (userId, role) => {
    const table = PROFILE_TABLES[role];

    const [profileResult, answersResult] = await Promise.all([
        table
            ? pool.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId])
            : Promise.resolve({ rows: [] }),
        pool.query('SELECT answers FROM onboarding_answers WHERE user_id = $1', [userId]),
    ]);

    return {
        role,
        profile: profileResult.rows[0]         ?? null,
        answers: answersResult.rows[0]?.answers ?? null,
    };
};

const updateCarbonProfile = async (userId, role, updates) => {
    const existingResult = await pool.query(
        'SELECT answers FROM onboarding_answers WHERE user_id = $1',
        [userId]
    );
    const existing = existingResult.rows[0]?.answers ?? {};
    const merged   = { ...existing, ...updates };

    await pool.query(
        `INSERT INTO onboarding_answers (user_id, answers, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET answers = EXCLUDED.answers, updated_at = NOW()`,
        [userId, JSON.stringify(merged)]
    );

    const boolVal = (v) => v === 'true' || v === true;

    if (role === 'individual') {
        const hsNum = parseInt(merged.household_size, 10) || null;
        await pool.query(
            `INSERT INTO individual_profiles
             (user_id, has_car, commute_mode, flights_per_year_range, priority_area,
              home_type, household_size, heating_type, car_fuel_type, weekly_km, diet_type, motivation)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (user_id) DO UPDATE SET
               has_car                = EXCLUDED.has_car,
               commute_mode           = EXCLUDED.commute_mode,
               flights_per_year_range = EXCLUDED.flights_per_year_range,
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
                boolVal(merged.has_car),
                merged.public_transport_freq,
                merged.domestic_flights,
                merged.priority_area,
                merged.home_type,
                hsNum,
                merged.heating_type,
                merged.car_fuel_type,
                merged.weekly_km,
                merged.diet_type,
                merged.motivation,
            ]
        );
    } else if (role === 'household') {
        const hsNum = parseInt(merged.household_size, 10) || null;
        await pool.query(
            `INSERT INTO household_profiles
             (user_id, household_size, home_type, has_regular_vehicle_use, priority_area,
              heating_type, car_fuel_type, diet_type, motivation)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (user_id) DO UPDATE SET
               household_size         = EXCLUDED.household_size,
               home_type              = EXCLUDED.home_type,
               has_regular_vehicle_use= EXCLUDED.has_regular_vehicle_use,
               priority_area          = EXCLUDED.priority_area,
               heating_type           = EXCLUDED.heating_type,
               car_fuel_type          = EXCLUDED.car_fuel_type,
               diet_type              = EXCLUDED.diet_type,
               motivation             = EXCLUDED.motivation`,
            [
                userId,
                hsNum,
                merged.home_type,
                boolVal(merged.has_car),
                merged.priority_area,
                merged.heating_type,
                merged.car_fuel_type,
                merged.diet_type,
                merged.motivation,
            ]
        );
    } else if (role === 'company') {
        await pool.query(
            `INSERT INTO company_profiles
             (user_id, company_name, industry, employee_count_range,
              has_company_vehicles, priority_area, department_count_range, motivation)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (user_id) DO UPDATE SET
               company_name           = EXCLUDED.company_name,
               industry               = EXCLUDED.industry,
               employee_count_range   = EXCLUDED.employee_count_range,
               has_company_vehicles   = EXCLUDED.has_company_vehicles,
               priority_area          = EXCLUDED.priority_area,
               department_count_range = EXCLUDED.department_count_range,
               motivation             = EXCLUDED.motivation`,
            [
                userId,
                merged.company_name,
                merged.industry,
                merged.employee_count_range,
                boolVal(merged.has_company_vehicles),
                merged.priority_area,
                merged.department_count_range,
                merged.motivation,
            ]
        );
    }
};

module.exports = { getCarbonProfile, updateCarbonProfile };
