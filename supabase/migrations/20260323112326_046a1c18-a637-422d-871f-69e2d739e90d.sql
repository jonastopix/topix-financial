
-- 1. Create notifications table
CREATE TABLE public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  type          text NOT NULL,
  priority      text NOT NULL DEFAULT 'info'
                  CHECK (priority IN ('info', 'important', 'action_required')),
  title         text NOT NULL,
  body          text,
  reference_type text,
  reference_id  uuid,
  deep_link     text,
  company_id    uuid,
  group_id      uuid,
  dedup_key     text NOT NULL,
  seen_at       timestamptz,
  read_at       timestamptz,
  email_sent_at timestamptz,
  push_sent_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Dedup constraint
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_dedup_unique UNIQUE (user_id, dedup_key);

-- Index for badge count query (unseen important/action_required)
CREATE INDEX idx_notifications_unseen
  ON public.notifications (user_id, created_at DESC)
  WHERE seen_at IS NULL;

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No INSERT/DELETE for clients — service role only

-- 2. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 3. RPC: mark_notifications_seen (batch set seen_at for all unseen)
CREATE OR REPLACE FUNCTION public.mark_notifications_seen()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  affected integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
  SET seen_at = now()
  WHERE user_id = auth.uid()
    AND seen_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 4. RPC: mark_notification_read (set read_at on single notification)
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
  SET read_at = now()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND read_at IS NULL;

  RETURN FOUND;
END;
$$;
