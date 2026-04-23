-- Migration 003: Add onboarding support (column + role-specific profile tables)
-- Safe to run on existing databases — uses IF NOT EXISTS / IF NOT EXISTS column guards.

-- 1. Add onboarding_completed flag to users.
--    DO block guards against re-running on a database that already has the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'onboarding_completed'
    ) THEN
        ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END$$;

-- 2. Individual onboarding profile.
CREATE TABLE IF NOT EXISTS individual_profiles (
    id                     SERIAL PRIMARY KEY,
    user_id                INT          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    has_car                BOOLEAN,
    commute_mode           VARCHAR(50),
    flights_per_year_range VARCHAR(50),
    lives_alone            BOOLEAN,
    priority_area          VARCHAR(50),
    created_at             TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 3. Household onboarding profile.
CREATE TABLE IF NOT EXISTS household_profiles (
    id                      SERIAL PRIMARY KEY,
    user_id                 INT          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    household_size          INTEGER,
    home_type               VARCHAR(50),
    has_regular_vehicle_use BOOLEAN,
    data_entry_preference   VARCHAR(50),
    priority_area           VARCHAR(50),
    created_at              TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 4. Company onboarding profile.
CREATE TABLE IF NOT EXISTS company_profiles (
    id                   SERIAL PRIMARY KEY,
    user_id              INT           NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name         VARCHAR(150),
    industry             VARCHAR(100),
    employee_count_range VARCHAR(50),
    has_company_vehicles BOOLEAN,
    priority_area        VARCHAR(50),
    created_at           TIMESTAMP     NOT NULL DEFAULT NOW()
);
