-- ============================================================
-- emissiON — Consolidated Database Schema
-- Incorporates all migrations 001–016.
-- Safe to apply to a fresh PostgreSQL database.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- ENUM: user_role
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('individual', 'household', 'company');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                             SERIAL        PRIMARY KEY,
    name                           VARCHAR(100)  NOT NULL,
    email                          VARCHAR(150)  NOT NULL CHECK (email = LOWER(email)),
    password                       VARCHAR(255)  NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

-- ─────────────────────────────────────────────────────────────
-- emission_records
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emission_records (
    id            SERIAL        PRIMARY KEY,
    user_id       INT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source        VARCHAR(100)  NOT NULL,
    amount        NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    date          DATE          NOT NULL,
    category      VARCHAR(50),
    activity_type VARCHAR(50),
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emission_records_user_date_idx ON emission_records (user_id, date DESC);

-- ─────────────────────────────────────────────────────────────
-- password_history
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_history (
    id            SERIAL    PRIMARY KEY,
    user_id       INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT      NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS password_history_user_id_idx ON password_history (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- onboarding_answers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_answers (
    id         SERIAL    PRIMARY KEY,
    user_id    INTEGER   NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    answers    JSONB     NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- individual_profiles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS individual_profiles (
    id                     SERIAL       PRIMARY KEY,
    user_id                INT          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    has_car                BOOLEAN,
    commute_mode           VARCHAR(50),
    flights_per_year_range VARCHAR(50),
    lives_alone            BOOLEAN,
    priority_area          VARCHAR(50),
    home_type              VARCHAR(50),
    household_size         INTEGER,
    heating_type           VARCHAR(50),
    car_fuel_type          VARCHAR(50),
    weekly_km              VARCHAR(50),
    diet_type              VARCHAR(50),
    motivation             VARCHAR(100),
    created_at             TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- household_profiles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS household_profiles (
    id                      SERIAL       PRIMARY KEY,
    user_id                 INT          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    household_size          INTEGER,
    home_type               VARCHAR(50),
    has_regular_vehicle_use BOOLEAN,
    data_entry_preference   VARCHAR(50),
    priority_area           VARCHAR(50),
    heating_type            VARCHAR(50),
    car_fuel_type           VARCHAR(50),
    diet_type               VARCHAR(50),
    motivation              VARCHAR(100),
    created_at              TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- company_profiles  (includes migration_012 + migration_015 columns)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_profiles (
    id                     SERIAL        PRIMARY KEY,
    user_id                INT           NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name           VARCHAR(150),
    industry               VARCHAR(100),
    employee_count_range   VARCHAR(50),
    has_company_vehicles   BOOLEAN,
    priority_area          VARCHAR(50),
    department_count_range VARCHAR(50),
    motivation             VARCHAR(100),
    cbam_sector            VARCHAR(50),
    exports_to_eu          BOOLEAN       NOT NULL DEFAULT false,
    annual_production      NUMERIC(15,2) CHECK (annual_production > 0),
    country                VARCHAR(100),
    default_carbon_price   NUMERIC(8,2)  CHECK (default_carbon_price >= 0),
    created_at             TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- pending_email_changes / pending_password_changes
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_email_changes (
    id          SERIAL       PRIMARY KEY,
    user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email   VARCHAR(150) NOT NULL,
    code_hash   TEXT         NOT NULL,
    expires_at  TIMESTAMP    NOT NULL,
    consumed_at TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
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

-- ─────────────────────────────────────────────────────────────
-- user_settings
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
    id                        SERIAL    PRIMARY KEY,
    user_id                   INTEGER   NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    email_notifications       BOOLEAN   NOT NULL DEFAULT TRUE,
    carbon_tips_notifications BOOLEAN   NOT NULL DEFAULT TRUE,
    created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- households
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS households (
    id             SERIAL        PRIMARY KEY,
    name           VARCHAR(150)  NOT NULL,
    admin_user_id  INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_code    VARCHAR(20)   NOT NULL UNIQUE,
    monthly_target NUMERIC(10,2) CHECK (monthly_target > 0),
    created_at     TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS households_invite_code_idx    ON households (invite_code);
CREATE INDEX IF NOT EXISTS households_admin_user_id_idx  ON households (admin_user_id);

-- ─────────────────────────────────────────────────────────────
-- household_members
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS household_members (
    id           SERIAL      PRIMARY KEY,
    household_id INTEGER     NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id      INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    role         VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS household_members_household_id_idx ON household_members (household_id);
CREATE UNIQUE INDEX IF NOT EXISTS household_members_user_id_unique ON household_members (user_id);

-- ─────────────────────────────────────────────────────────────
-- household_tasks  (includes migration_011 emission-tracking columns)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS household_tasks (
    id                SERIAL        PRIMARY KEY,
    household_id      INTEGER       NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    assigned_by       INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_to       INTEGER       REFERENCES users(id) ON DELETE SET NULL,
    title             VARCHAR(200)  NOT NULL,
    description       TEXT,
    target_reduction  NUMERIC(10,2) CHECK (target_reduction > 0),
    status            VARCHAR(20)   NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    due_date          DATE,
    emission_category VARCHAR(50),
    baseline_period   VARCHAR(7),
    target_pct        NUMERIC(5,2),
    baseline_amount   NUMERIC(10,2),
    target_amount     NUMERIC(10,2),
    created_at        TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS household_tasks_household_id_idx ON household_tasks (household_id);
CREATE INDEX IF NOT EXISTS household_tasks_assigned_to_idx  ON household_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS household_tasks_assigned_by_idx  ON household_tasks (assigned_by);
CREATE INDEX IF NOT EXISTS idx_household_tasks_emission_category
    ON household_tasks (emission_category) WHERE emission_category IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- emission_comments
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emission_comments (
    id                 SERIAL    PRIMARY KEY,
    emission_record_id INTEGER   NOT NULL REFERENCES emission_records(id)  ON DELETE CASCADE,
    household_id       INTEGER   NOT NULL REFERENCES households(id)         ON DELETE CASCADE,
    admin_user_id      INTEGER   NOT NULL REFERENCES users(id)              ON DELETE CASCADE,
    member_user_id     INTEGER   NOT NULL REFERENCES users(id)              ON DELETE CASCADE,
    comment            TEXT      NOT NULL CHECK (TRIM(comment) <> ''),
    created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emission_comments_record_id_idx    ON emission_comments (emission_record_id);
CREATE INDEX IF NOT EXISTS emission_comments_household_id_idx ON emission_comments (household_id);
CREATE INDEX IF NOT EXISTS emission_comments_admin_user_id_idx  ON emission_comments (admin_user_id);
CREATE INDEX IF NOT EXISTS emission_comments_member_user_id_idx ON emission_comments (member_user_id);

-- ─────────────────────────────────────────────────────────────
-- cbam_entries  (includes migration_012–015 columns)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cbam_entries (
    id                      SERIAL        PRIMARY KEY,
    user_id                 INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_name            VARCHAR(200),
    export_category         VARCHAR(50)   NOT NULL,
    export_amount           NUMERIC(15,4) NOT NULL CHECK (export_amount > 0),
    emission_factor         NUMERIC(12,6) NOT NULL CHECK (emission_factor > 0),
    carbon_price            NUMERIC(8,2)  NOT NULL CHECK (carbon_price >= 0),
    paid_carbon_price       NUMERIC(8,2)  NOT NULL DEFAULT 0 CHECK (paid_carbon_price >= 0),
    period_start            DATE          NOT NULL,
    period_end              DATE,
    total_embedded_emission NUMERIC(15,4) NOT NULL,
    estimated_cbam_cost     NUMERIC(15,2) NOT NULL,
    risk_level              VARCHAR(20)   NOT NULL DEFAULT 'low'
                                CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    notes                   TEXT,
    destination_region      VARCHAR(100),
    source_emission_total   NUMERIC(15,4),
    emission_factor_source  VARCHAR(20)   NOT NULL DEFAULT 'manual'
                                CHECK (emission_factor_source IN ('auto', 'manual')),
    emission_record_id      INTEGER       REFERENCES emission_records(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT cbam_entries_period_end_after_start
        CHECK (period_end IS NULL OR period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS cbam_entries_user_period_idx   ON cbam_entries (user_id, period_start DESC);
CREATE INDEX IF NOT EXISTS cbam_entries_user_category_idx ON cbam_entries (user_id, export_category);

-- ─────────────────────────────────────────────────────────────
-- company_tasks
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_tasks (
    id                   SERIAL        PRIMARY KEY,
    user_id              INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title                VARCHAR(200)  NOT NULL,
    description          TEXT,
    emission_category    VARCHAR(50),
    target_reduction_pct NUMERIC(5,2)  CHECK (target_reduction_pct > 0 AND target_reduction_pct < 100),
    baseline_emission    NUMERIC(15,4),
    target_emission      NUMERIC(15,4),
    due_date             DATE,
    status               VARCHAR(20)   NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'in_progress', 'completed')),
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_tasks_user_idx ON company_tasks (user_id);
CREATE INDEX IF NOT EXISTS company_tasks_category_idx
    ON company_tasks (user_id, emission_category) WHERE emission_category IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- company_simulations
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_simulations (
    id         SERIAL      PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(200),
    inputs     JSONB       NOT NULL DEFAULT '{}',
    results    JSONB       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_simulations_user_idx
    ON company_simulations (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- admin_cbam_config  (with built-in seed defaults)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_cbam_config (
    config_key   VARCHAR(100) PRIMARY KEY,
    config_value TEXT         NOT NULL,
    description  TEXT,
    updated_by   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO admin_cbam_config (config_key, config_value, description) VALUES
    ('carbon_price_default',    '65.00',  'EU ETS karbonun varsayılan fiyatı (€/tCO₂)')
    ON CONFLICT (config_key) DO NOTHING;
INSERT INTO admin_cbam_config (config_key, config_value, description) VALUES
    ('risk_threshold_medium',   '10000',  'Bu tutarın (€) üzerindeki CBAM maliyeti orta risk sayılır')
    ON CONFLICT (config_key) DO NOTHING;
INSERT INTO admin_cbam_config (config_key, config_value, description) VALUES
    ('risk_threshold_high',     '50000',  'Bu tutarın (€) üzerindeki CBAM maliyeti yüksek risk sayılır')
    ON CONFLICT (config_key) DO NOTHING;
INSERT INTO admin_cbam_config (config_key, config_value, description) VALUES
    ('risk_threshold_critical', '200000', 'Bu tutarın (€) üzerindeki CBAM maliyeti kritik risk sayılır')
    ON CONFLICT (config_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- user_gamification
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_gamification (
    user_id         INTEGER     PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_streak  INTEGER     NOT NULL DEFAULT 0,
    longest_streak  INTEGER     NOT NULL DEFAULT 0,
    last_entry_date DATE,
    total_xp        INTEGER     NOT NULL DEFAULT 0,
    level           INTEGER     NOT NULL DEFAULT 1,
    badges          JSONB       NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_gamification_user_id ON user_gamification (user_id);

-- ─────────────────────────────────────────────────────────────
-- Trigger function: auto-stamp updated_at on any table that has it
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS company_profiles_updated_at ON company_profiles;
CREATE TRIGGER company_profiles_updated_at
    BEFORE UPDATE ON company_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
