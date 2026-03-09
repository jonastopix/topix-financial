CREATE TABLE public.slack_report_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  message_id uuid NOT NULL UNIQUE,
  company_id uuid NOT NULL,
  slack_channel_id text NOT NULL,
  slack_ts text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.slack_report_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Advisors can view report notification logs"
  ON public.slack_report_notification_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));