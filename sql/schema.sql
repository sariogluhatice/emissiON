-- EMISSION Project - Database Schema
-- Run this file once to set up the database.

-- Create a custom type for user roles.
CREATE TYPE user_role AS ENUM ('individual', 'household', 'company');

-- Users table: stores all registered accounts.
CREATE TABLE IF NOT EXISTS users (
    id                             SERIAL PRIMARY KEY,
    name                           VARCHAR(100)  NOT NULL,
    email                          VARCHAR(150)  NOT NULL CHECK (email = LOWER(email)),
    password                       VARCHAR(255)  NOT NULL,          -- bcrypt hash, never plaintext
    role                           user_role     NOT NULL DEFAULT 'individual',
    is_verified                    BOOLEAN       NOT NULL DEFAULT FALSE,
    onboarding_completed           BOOLEAN       NOT NULL DEFAULT FALSE,
    verification_code_hash         TEXT,
    verification_code_expires_at   TIMESTAMP,
    verified_at                    TIMESTAMP,
    reset_token_hash               TEXT,
    reset_token_expires_at         TIMESTAMP,
    created_at                     TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique index on email.
-- LOWER(email) ensures that 'User@Example.com' and 'user@example.com' are
-- treated as the same address, even if a value bypasses the application layer.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

-- Emission records table: stores CO₂ emission entries per user.
CREATE TABLE IF NOT EXISTS emission_records (
    id         SERIAL PRIMARY KEY,
    user_id    INT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source     VARCHAR(100)  NOT NULL,
    amount     NUMERIC(10,2) NOT NULL CHECK (amount > 0),  -- kg CO₂, must be positive
    date       DATE          NOT NULL,
    created_at TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX ON emission_records (user_id, date DESC);

-- Password history: keeps the last N hashed passwords per user to prevent reuse.
CREATE TABLE IF NOT EXISTS password_history (
    id            SERIAL    PRIMARY KEY,
    user_id       INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT      NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS password_history_user_id_idx
    ON password_history (user_id, created_at DESC);

-- Full JSONB store for all questionnaire answers (every role).
CREATE TABLE IF NOT EXISTS onboarding_answers (
    id         SERIAL    PRIMARY KEY,
    user_id    INTEGER   NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    answers    JSONB     NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Onboarding profile for individual users.
CREATE TABLE IF NOT EXISTS individual_profiles (
    id                     SERIAL PRIMARY KEY,
    user_id                INT          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    has_car                BOOLEAN,
    commute_mode           VARCHAR(50),
    flights_per_year_range VARCHAR(50),
    lives_alone            BOOLEAN,
    priority_area          VARCHAR(50),
    -- expanded fields (migration 006)
    home_type              VARCHAR(50),
    household_size         INTEGER,
    heating_type           VARCHAR(50),
    car_fuel_type          VARCHAR(50),
    weekly_km              VARCHAR(50),
    diet_type              VARCHAR(50),
    motivation             VARCHAR(100),
    created_at             TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Onboarding profile for household users.
CREATE TABLE IF NOT EXISTS household_profiles (
    id                      SERIAL PRIMARY KEY,
    user_id                 INT          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    household_size          INTEGER,
    home_type               VARCHAR(50),
    has_regular_vehicle_use BOOLEAN,
    data_entry_preference   VARCHAR(50),
    priority_area           VARCHAR(50),
    -- expanded fields (migration 006)
    heating_type            VARCHAR(50),
    car_fuel_type           VARCHAR(50),
    diet_type               VARCHAR(50),
    motivation              VARCHAR(100),
    created_at              TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Onboarding profile for company users.
CREATE TABLE IF NOT EXISTS company_profiles (
    id                      SERIAL PRIMARY KEY,
    user_id                 INT           NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name            VARCHAR(150),
    industry                VARCHAR(100),
    employee_count_range    VARCHAR(50),
    has_company_vehicles    BOOLEAN,
    priority_area           VARCHAR(50),
    -- expanded fields (migration 006)
    department_count_range  VARCHAR(50),
    motivation              VARCHAR(100),
    created_at              TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- Pending sensitive-change verification requests (migration 008).
CREATE TABLE IF NOT EXISTS pending_email_changes (
    id          SERIAL    PRIMARY KEY,
    user_id     INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email   VARCHAR(150) NOT NULL,
    code_hash   TEXT      NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pending_email_changes_user_idx
    ON pending_email_changes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pending_password_changes (
    id                SERIAL    PRIMARY KEY,
    user_id           INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_password_hash TEXT      NOT NULL,
    code_hash         TEXT      NOT NULL,
    expires_at        TIMESTAMP NOT NULL,
    consumed_at       TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pending_password_changes_user_idx
    ON pending_password_changes (user_id, created_at DESC);

-- User notification and app settings (migration 007).
CREATE TABLE IF NOT EXISTS user_settings (
    id                          SERIAL    PRIMARY KEY,
    user_id                     INTEGER   NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    email_notifications         BOOLEAN   NOT NULL DEFAULT TRUE,
    carbon_tips_notifications   BOOLEAN   NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP NOT NULL DEFAULT NOW()
);
