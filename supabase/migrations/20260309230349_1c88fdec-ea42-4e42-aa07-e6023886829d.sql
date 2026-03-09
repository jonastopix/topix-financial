
CREATE TABLE public.slack_handout_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handout_id uuid NOT NULL REFERENCES public.handouts(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  slack_channel_id text NOT NULL,
  slack_ts text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(handout_id, completed_at)
);

ALTER TABLE public.slack_handout_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view handout notification logs"
  ON public.slack_handout_notification_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));
