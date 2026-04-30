-- Migration 006: Full onboarding answers store + expanded profile columns.
-- Safe to run multiple times.

-- Full JSONB store for all questionnaire answers (every role).
CREATE TABLE IF NOT EXISTS onboarding_answers (
    id         SERIAL    PRIMARY KEY,
    user_id    INTEGER   NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    answers    JSONB     NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Expand individual_profiles with richer normalized fields.
ALTER TABLE individual_profiles
    ADD COLUMN IF NOT EXISTS home_type       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS household_size  INTEGER,
    ADD COLUMN IF NOT EXISTS heating_type    VARCHAR(50),
    ADD COLUMN IF NOT EXISTS car_fuel_type   VARCHAR(50),
    ADD COLUMN IF NOT EXISTS weekly_km       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS diet_type       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS motivation      VARCHAR(100);

-- Expand household_profiles.
ALTER TABLE household_profiles
    ADD COLUMN IF NOT EXISTS heating_type  VARCHAR(50),
    ADD COLUMN IF NOT EXISTS car_fuel_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS diet_type     VARCHAR(50),
    ADD COLUMN IF NOT EXISTS motivation    VARCHAR(100);

-- Expand company_profiles.
ALTER TABLE company_profiles
    ADD COLUMN IF NOT EXISTS department_count_range VARCHAR(50),
    ADD COLUMN IF NOT EXISTS motivation             VARCHAR(100);
