-- Allow 'cancelled' status for company_tasks
ALTER TABLE company_tasks
  DROP CONSTRAINT IF EXISTS company_tasks_status_check;

ALTER TABLE company_tasks
  ADD CONSTRAINT company_tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));
