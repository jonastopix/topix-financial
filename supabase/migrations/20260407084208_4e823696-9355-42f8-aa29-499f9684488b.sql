-- Advisor milestone actions: snooze + note per milestone per advisor

CREATE TABLE public.advisor_milestone_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snoozed_until TIMESTAMPTZ NOT NULL,
  note TEXT,
  UNIQUE (milestone_id, advisor_id)
);

ALTER TABLE public.advisor_milestone_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can manage own milestone actions"
  ON public.advisor_milestone_actions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'advisor') OR public.has_role(auth.uid(), 'admin'));