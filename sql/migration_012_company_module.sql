-- =============================================================
-- Migration 012 — Company CBAM Module
--
-- PART 1: Extend the existing company_profiles table.
--   company_profiles was created in the initial schema for
--   onboarding data.  We add CBAM-specific operational fields
--   here rather than creating a second profile table, keeping
--   all company identity data in one place.
--   All new columns are nullable so existing onboarding rows
--   are unaffected (idempotent via IF NOT EXISTS).
--
-- PART 2: New tables for CBAM functionality:
--   cbam_entries       — export emission records + computed costs
--   company_tasks      — reduction tasks (mirrors household_tasks)
--   company_simulations — saved what-if scenario inputs/results
--   admin_cbam_config  — admin-managed global defaults
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- PART 1: Extend company_profiles
-- ─────────────────────────────────────────────────────────────

ALTER TABLE company_profiles
    ADD COLUMN IF NOT EXISTS cbam_sector         VARCHAR(50),
    ADD COLUMN IF NOT EXISTS exports_to_eu       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS annual_production   NUMERIC(15,2)    CHECK (annual_production > 0),
    ADD COLUMN IF NOT EXISTS country             VARCHAR(100),
    ADD COLUMN IF NOT EXISTS default_carbon_price NUMERIC(8,2)    CHECK (default_carbon_price >= 0);

-- ─────────────────────────────────────────────────────────────
-- PART 2: cbam_entries
--   One row per export product line per period.
--   The computed columns (total_embedded_emission,
--   estimated_cbam_cost, risk_level) are stored at insertion
--   time so historical calculations are immutable — they do not
--   drift if the user later changes their default carbon price.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cbam_entries (
    id                       SERIAL        PRIMARY KEY,
    user_id                  INTEGER       NOT NULL
                                 REFERENCES users(id) ON DELETE CASCADE,
    product_name             VARCHAR(200)  NOT NULL,
    export_category          VARCHAR(50)   NOT NULL,   -- CBAM sector enum
    export_amount            NUMERIC(15,4) NOT NULL    CHECK (export_amount > 0),
    emission_factor          NUMERIC(12,6) NOT NULL    CHECK (emission_factor > 0),
    carbon_price             NUMERIC(8,2)  NOT NULL    CHECK (carbon_price >= 0),
    paid_carbon_price        NUMERIC(8,2)  NOT NULL DEFAULT 0
                                               CHECK (paid_carbon_price >= 0),
    period_start             DATE          NOT NULL,
    -- Computed and stored at insertion time
    total_embedded_emission  NUMERIC(15,4) NOT NULL,   -- export_amount * emission_factor (tCO₂)
    estimated_cbam_cost      NUMERIC(15,2) NOT NULL,   -- tCO₂ * max(0, carbon_price - paid)  (€)
    risk_level               VARCHAR(20)   NOT NULL DEFAULT 'low'
                                 CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    notes                    TEXT,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Primary access pattern: all entries for a user ordered by period
CREATE INDEX IF NOT EXISTS cbam_entries_user_period_idx
    ON cbam_entries (user_id, period_start DESC);

-- Dashboard: filter by user + category
CREATE INDEX IF NOT EXISTS cbam_entries_user_category_idx
    ON cbam_entries (user_id, export_category);

-- ─────────────────────────────────────────────────────────────
-- PART 3: company_tasks
--   Emission-reduction tasks owned by a single company user.
--   baseline_emission and target_emission are computed at task
--   creation time from cbam_entries data, then stored.
--   current progress is always computed live at query time
--   (same pattern as household task tracking).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_tasks (
    id                   SERIAL        PRIMARY KEY,
    user_id              INTEGER       NOT NULL
                             REFERENCES users(id) ON DELETE CASCADE,
    title                VARCHAR(200)  NOT NULL,
    description          TEXT,
    emission_category    VARCHAR(50),               -- ties to cbam_entries.export_category
    target_reduction_pct NUMERIC(5,2)               CHECK (target_reduction_pct > 0 AND target_reduction_pct < 100),
    baseline_emission    NUMERIC(15,4),             -- tCO₂, at task creation time
    target_emission      NUMERIC(15,4),             -- baseline * (1 - pct/100)
    due_date             DATE,
    status               VARCHAR(20)   NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'in_progress', 'completed')),
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_tasks_user_idx
    ON company_tasks (user_id);

CREATE INDEX IF NOT EXISTS company_tasks_category_idx
    ON company_tasks (user_id, emission_category)
    WHERE emission_category IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- PART 4: company_simulations
--   Saved what-if scenario inputs and their computed results.
--   JSONB is used for both columns because simulation parameter
--   sets will evolve — new scenario types should not require
--   a migration for each addition.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_simulations (
    id         SERIAL       PRIMARY KEY,
    user_id    INTEGER      NOT NULL
                   REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(200),
    inputs     JSONB        NOT NULL DEFAULT '{}',
    results    JSONB        NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_simulations_user_idx
    ON company_simulations (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- PART 5: admin_cbam_config
--   Key-value store for admin-adjustable global defaults.
--   Keeping thresholds in the database means the system admin
--   can update them (e.g. when EU ETS price changes) without
--   a code deployment.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_cbam_config (
    config_key    VARCHAR(100) PRIMARY KEY,
    config_value  TEXT         NOT NULL,
    description   TEXT,
    updated_by    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed defaults (idempotent — ON CONFLICT DO NOTHING skips if key exists)
INSERT INTO admin_cbam_config (config_key, config_value, description) VALUES
    ('carbon_price_default',   '65.00',   'EU ETS karbonun varsayılan fiyatı (€/tCO₂)')
    ON CONFLICT (config_key) DO NOTHING;

INSERT INTO admin_cbam_config (config_key, config_value, description) VALUES
    ('risk_threshold_medium',  '10000',   'Bu tutarın (€) üzerindeki CBAM maliyeti orta risk sayılır')
    ON CONFLICT (config_key) DO NOTHING;

INSERT INTO admin_cbam_config (config_key, config_value, description) VALUES
    ('risk_threshold_high',    '50000',   'Bu tutarın (€) üzerindeki CBAM maliyeti yüksek risk sayılır')
    ON CONFLICT (config_key) DO NOTHING;

INSERT INTO admin_cbam_config (config_key, config_value, description) VALUES
    ('risk_threshold_critical','200000',  'Bu tutarın (€) üzerindeki CBAM maliyeti kritik risk sayılır')
    ON CONFLICT (config_key) DO NOTHING;
