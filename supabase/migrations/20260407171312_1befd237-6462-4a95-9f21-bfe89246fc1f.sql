-- Drop old per-advisor unique constraint and make snooze global per milestone

ALTER TABLE public.advisor_milestone_actions
  DROP CONSTRAINT IF EXISTS advisor_milestone_actions_milestone_id_advisor_id_key;

ALTER TABLE public.advisor_milestone_actions
  ADD COLUMN IF NOT EXISTS actioned_by_advisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Copy existing advisor_id to actioned_by_advisor_id
UPDATE public.advisor_milestone_actions
  SET actioned_by_advisor_id = advisor_id
  WHERE actioned_by_advisor_id IS NULL;

-- Add new unique constraint: one active snooze per milestone globally
ALTER TABLE public.advisor_milestone_actions
  ADD CONSTRAINT advisor_milestone_actions_milestone_id_key UNIQUE (milestone_id);