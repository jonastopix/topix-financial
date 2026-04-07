-- 1. Add progress_updated_at to milestones so stalled detection
--    only fires when PROGRESS actually changes, not any field update

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS progress_updated_at TIMESTAMPTZ;

UPDATE public.milestones
  SET progress_updated_at = updated_at
  WHERE progress_updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.update_milestone_progress_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.progress IS DISTINCT FROM OLD.progress THEN
    NEW.progress_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER milestone_progress_updated_at
  BEFORE UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_milestone_progress_timestamp();

-- 2. Table for advisor actions on financial alerts (snooze + note, global per alert)

CREATE TABLE public.advisor_financial_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  actioned_by_advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snoozed_until TIMESTAMPTZ NOT NULL,
  note TEXT,
  UNIQUE (notification_id)
);

ALTER TABLE public.advisor_financial_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can manage financial actions"
  ON public.advisor_financial_actions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'advisor') OR public.has_role(auth.uid(), 'admin'));