-- ── migration_024: task period-based progress calculation ────────────────────
--
-- Adds columns needed for the corrected calculation:
--   start_date    — date the task became active (used as current-period lower bound)
--   baseline_days — days in the baseline month (e.g. April = 30)
--   period_target — prorated target for the exact task duration (kg)
--
-- company_tasks also gets:
--   baseline_period        — "YYYY-MM" of the month used as baseline
--   period_target_emission — prorated target in tCO₂

-- ── household_tasks ───────────────────────────────────────────────────────────
ALTER TABLE household_tasks
    ADD COLUMN IF NOT EXISTS start_date     DATE,
    ADD COLUMN IF NOT EXISTS baseline_days  INT,
    ADD COLUMN IF NOT EXISTS period_target  FLOAT;

-- Backfill start_date for existing tasks
UPDATE household_tasks
SET    start_date = created_at::date
WHERE  start_date IS NULL;

-- ── company_tasks ─────────────────────────────────────────────────────────────
ALTER TABLE company_tasks
    ADD COLUMN IF NOT EXISTS start_date              DATE,
    ADD COLUMN IF NOT EXISTS baseline_period         CHAR(7),
    ADD COLUMN IF NOT EXISTS baseline_days           INT,
    ADD COLUMN IF NOT EXISTS period_target_emission  FLOAT;

-- Backfill start_date for existing tasks
UPDATE company_tasks
SET    start_date = created_at::date
WHERE  start_date IS NULL;
