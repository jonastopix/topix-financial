-- Allow 'parked' as a valid milestone status
ALTER TABLE milestones DROP CONSTRAINT IF EXISTS milestones_status_check;
ALTER TABLE milestones ADD CONSTRAINT milestones_status_check
  CHECK (status IN ('active', 'completed', 'parked'));