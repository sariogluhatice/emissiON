-- Migration 019: Real company reports
-- Replaces simulation-backed sharing with a proper snapshot report system.
--
-- Changes:
--   1. Create company_reports — immutable snapshot reports
--   2. Drop + recreate company_report_access_requests referencing company_reports
--   3. Remove report_no column from company_simulations
--
-- company_report_seq (created in migration_018) is kept and reused here.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. company_reports — one row per generated report snapshot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_reports (
    id           SERIAL        PRIMARY KEY,
    user_id      INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_no    VARCHAR(20)   NOT NULL UNIQUE,
    report_type  VARCHAR(50)   NOT NULL DEFAULT 'full'
                     CHECK (report_type IN ('full', 'cbam_only', 'emission_only')),
    period_start DATE,
    period_end   DATE,
    snapshot     JSONB         NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_reports_user
    ON company_reports (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Drop old access-requests table (was referencing company_simulations)
--    Recreate it pointing at company_reports instead.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS company_report_access_requests;

CREATE TABLE company_report_access_requests (
    id                  SERIAL      PRIMARY KEY,
    report_id           INTEGER     NOT NULL REFERENCES company_reports(id) ON DELETE CASCADE,
    requester_user_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at         TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    UNIQUE (report_id, requester_user_id)
);

CREATE INDEX IF NOT EXISTS idx_rpt_access_requester
    ON company_report_access_requests (requester_user_id);
CREATE INDEX IF NOT EXISTS idx_rpt_access_owner
    ON company_report_access_requests (owner_user_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Remove report_no from company_simulations
--    Simulations are now a standalone what-if analysis tool.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE company_simulations DROP COLUMN IF EXISTS report_no;

-- company_report_seq stays — company_reports.report_no uses it.
