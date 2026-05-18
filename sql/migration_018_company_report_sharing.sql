-- Migration 018: Company Report Sharing
-- Adds report_no to company_simulations and creates access request workflow

-- Create global sequence for report numbers
CREATE SEQUENCE IF NOT EXISTS company_report_seq START 1 INCREMENT 1;

-- Add report_no to company_simulations
ALTER TABLE company_simulations ADD COLUMN IF NOT EXISTS report_no VARCHAR(20);

-- Backfill existing rows
UPDATE company_simulations
SET report_no = 'EMR-' || TO_CHAR(created_at, 'YYYY') || '-' || LPAD(nextval('company_report_seq')::text, 4, '0')
WHERE report_no IS NULL;

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_simulations_report_no ON company_simulations(report_no);

-- Create access requests table
CREATE TABLE IF NOT EXISTS company_report_access_requests (
    id                  SERIAL PRIMARY KEY,
    report_id           INTEGER NOT NULL REFERENCES company_simulations(id) ON DELETE CASCADE,
    requester_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at         TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    UNIQUE(report_id, requester_user_id)
);

CREATE INDEX IF NOT EXISTS idx_rpt_access_requester ON company_report_access_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_rpt_access_owner     ON company_report_access_requests(owner_user_id, status);
