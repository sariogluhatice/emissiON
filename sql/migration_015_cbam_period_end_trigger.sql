-- =============================================================
-- Migration 015 — CBAM period_end + company_profiles updated_at
--
-- 1. cbam_entries.period_end  — stores quarter/period end date so
--    a single row can represent a multi-month export window
--    (e.g. Jan–Jun CBAM reporting quarter).
--
-- 2. company_profiles.updated_at — adds the column and an BEFORE
--    UPDATE trigger so any profile upsert automatically stamps the
--    last-modified time without application code changes.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. cbam_entries — add period_end
-- ─────────────────────────────────────────────────────────────
ALTER TABLE cbam_entries
    ADD COLUMN IF NOT EXISTS period_end DATE;

-- Ensure period_end is after period_start when both are supplied.
-- A DO NOTHING on constraint-already-exists avoids idempotency issues.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cbam_entries_period_end_after_start'
    ) THEN
        ALTER TABLE cbam_entries
            ADD CONSTRAINT cbam_entries_period_end_after_start
            CHECK (period_end IS NULL OR period_end >= period_start);
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. company_profiles — updated_at column + trigger
-- ─────────────────────────────────────────────────────────────
ALTER TABLE company_profiles
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Shared trigger function (idempotent — used by any table that needs it)
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
