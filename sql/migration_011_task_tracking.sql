-- Migration 011: Add emission tracking columns to household_tasks
-- All columns are nullable so existing task rows are unaffected.

ALTER TABLE household_tasks
    ADD COLUMN IF NOT EXISTS emission_category VARCHAR(50),
    ADD COLUMN IF NOT EXISTS baseline_period   VARCHAR(7),    -- 'YYYY-MM'
    ADD COLUMN IF NOT EXISTS target_pct        NUMERIC(5,2),  -- e.g. 15.00
    ADD COLUMN IF NOT EXISTS baseline_amount   NUMERIC(10,2), -- kg CO₂e in baseline_period
    ADD COLUMN IF NOT EXISTS target_amount     NUMERIC(10,2); -- baseline × (1 - target_pct/100)

CREATE INDEX IF NOT EXISTS idx_household_tasks_emission_category
    ON household_tasks (emission_category)
    WHERE emission_category IS NOT NULL;
