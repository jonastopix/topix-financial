CREATE TABLE public.pulse_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  period_key text NOT NULL,
  went_well text,
  biggest_challenge text,
  milestone_progress integer CHECK (milestone_progress >= 0 AND milestone_progress <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_key)
);

ALTER TABLE public.pulse_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage own checkins"
  ON public.pulse_checkins
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Advisors read checkins for their companies"
  ON public.pulse_checkins
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_companies gc
      JOIN public.group_advisor_access gaa ON gaa.group_id = gc.group_id
      WHERE gc.company_id = pulse_checkins.company_id
        AND gaa.advisor_user_id = auth.uid()
    )
  );