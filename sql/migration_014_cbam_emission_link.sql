-- =============================================================
-- Migration 014 — Link cbam_entries to emission_records
--
-- When a CBAM export declaration is saved, the service also
-- creates a matching emission_records row so the export
-- appears in Emisyon Takibi and dashboard calculations.
-- This column stores that link so the linked record can be
-- cleaned up when the declaration is deleted.
--
-- ON DELETE SET NULL: deleting the emission_record manually
-- leaves the cbam_entry intact (it just loses the link).
-- =============================================================

ALTER TABLE cbam_entries
    ADD COLUMN IF NOT EXISTS emission_record_id INTEGER
        REFERENCES emission_records(id) ON DELETE SET NULL;
