
-- Table: slack_conversation_threads — maps conversation to a single Slack thread
CREATE TABLE public.slack_conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slack_channel_id text NOT NULL,
  slack_thread_ts text,
  status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'ready')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.slack_conversation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view slack threads"
  ON public.slack_conversation_threads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));

-- Table: slack_notification_log — idempotency guard
CREATE TABLE public.slack_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  notification_type text NOT NULL DEFAULT 'new_chat_message',
  slack_channel_id text NOT NULL,
  slack_ts text,
  slack_thread_ts text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, notification_type)
);

ALTER TABLE public.slack_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view slack logs"
  ON public.slack_notification_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));
