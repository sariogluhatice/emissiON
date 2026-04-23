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

-- Onboarding profile for individual users.
CREATE TABLE IF NOT EXISTS individual_profiles (
    id                   SERIAL PRIMARY KEY,
    user_id              INT          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    has_car              BOOLEAN,
    commute_mode         VARCHAR(50),
    flights_per_year_range VARCHAR(50),
    lives_alone          BOOLEAN,
    priority_area        VARCHAR(50),
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Onboarding profile for household users.
CREATE TABLE IF NOT EXISTS household_profiles (
    id                        SERIAL PRIMARY KEY,
    user_id                   INT          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    household_size            INTEGER,
    home_type                 VARCHAR(50),
    has_regular_vehicle_use   BOOLEAN,
    data_entry_preference     VARCHAR(50),
    priority_area             VARCHAR(50),
    created_at                TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Onboarding profile for company users.
CREATE TABLE IF NOT EXISTS company_profiles (
    id                    SERIAL PRIMARY KEY,
    user_id               INT           NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name          VARCHAR(150),
    industry              VARCHAR(100),
    employee_count_range  VARCHAR(50),
    has_company_vehicles  BOOLEAN,
    priority_area         VARCHAR(50),
    created_at            TIMESTAMP     NOT NULL DEFAULT NOW()
);
