-- migration_017: add 'cancelled' status to household_tasks
ALTER TABLE household_tasks
    DROP CONSTRAINT IF EXISTS household_tasks_status_check;

ALTER TABLE household_tasks
    ADD CONSTRAINT household_tasks_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));
