
-- Phase D: Extend group_conversations for ops parity

-- 1. Add ops columns
ALTER TABLE public.group_conversations
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_member_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS conversation_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS awaiting_reply_from text,
  ADD COLUMN IF NOT EXISTS assigned_advisor_id uuid,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by_advisor_id uuid,
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_advisor_id uuid,
  ADD COLUMN IF NOT EXISTS last_advisor_reply_at timestamptz;

-- 2. Backfill existing rows from group_messages
WITH msg_stats AS (
  SELECT
    gm.conversation_id,
    MAX(gm.created_at) AS last_msg,
    MAX(CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = gm.sender_id AND ur.role IN ('advisor','admin')
    ) THEN gm.created_at END) AS last_member_msg,
    MAX(CASE WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = gm.sender_id AND ur.role IN ('advisor','admin')
    ) THEN gm.created_at END) AS last_advisor_msg
  FROM public.group_messages gm
  GROUP BY gm.conversation_id
),
latest_sender AS (
  SELECT DISTINCT ON (gm.conversation_id)
    gm.conversation_id,
    gm.sender_id
  FROM public.group_messages gm
  ORDER BY gm.conversation_id, gm.created_at DESC
)
UPDATE public.group_conversations gc SET
  last_message_at = COALESCE(ms.last_msg, gc.created_at),
  last_member_message_at = ms.last_member_msg,
  last_advisor_reply_at = ms.last_advisor_msg,
  awaiting_reply_from = CASE
    WHEN ms.last_msg IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = ls.sender_id AND ur.role IN ('advisor','admin')
    ) THEN 'company'
    ELSE 'advisor'
  END,
  conversation_status = 'open'
FROM msg_stats ms
JOIN latest_sender ls ON ls.conversation_id = ms.conversation_id
WHERE gc.id = ms.conversation_id;

-- 3. Scoped UPDATE RLS policy
CREATE POLICY "Advisors can update accessible group conversations"
  ON public.group_conversations FOR UPDATE TO authenticated
  USING (advisor_has_group_access(auth.uid(), group_id))
  WITH CHECK (advisor_has_group_access(auth.uid(), group_id));

-- 4. Reply state trigger on group_messages
CREATE OR REPLACE FUNCTION public.update_group_conversation_reply_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  sender_is_advisor boolean;
BEGIN
  IF NEW.message_type IS DISTINCT FROM 'user' THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.sender_id AND role IN ('advisor','admin')
  ) INTO sender_is_advisor;

  PERFORM set_config('app.allow_conversation_ops_update', '1', true);

  IF sender_is_advisor THEN
    UPDATE public.group_conversations SET
      awaiting_reply_from = 'company',
      last_advisor_reply_at = NEW.created_at,
      last_message_at = NEW.created_at,
      acknowledged_at = NULL,
      acknowledged_by_advisor_id = NULL,
      assigned_advisor_id = COALESCE(assigned_advisor_id, NEW.sender_id),
      conversation_status = 'open',
      resolved_at = NULL,
      resolved_by_advisor_id = NULL,
      follow_up_at = NULL
    WHERE id = NEW.conversation_id;
  ELSE
    UPDATE public.group_conversations SET
      awaiting_reply_from = 'advisor',
      last_member_message_at = NEW.created_at,
      last_message_at = NEW.created_at,
      acknowledged_at = NULL,
      acknowledged_by_advisor_id = NULL,
      conversation_status = 'open',
      resolved_at = NULL,
      resolved_by_advisor_id = NULL,
      follow_up_at = NULL
    WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_group_conversation_reply_state
  AFTER INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_group_conversation_reply_state();

-- 5. Protect ops fields trigger
CREATE OR REPLACE FUNCTION public.protect_group_conversation_ops_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  -- Block structural field mutations for everyone
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'structural fields (id, group_id, created_at) are immutable';
  END IF;

  -- System bypass (used by reply-state trigger)
  IF current_setting('app.allow_conversation_ops_update', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- Advisor bypass for ops fields (structural already blocked above)
  IF has_role(auth.uid(), 'advisor'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Members: block all ops field changes
  IF NEW.assigned_advisor_id IS DISTINCT FROM OLD.assigned_advisor_id
     OR NEW.awaiting_reply_from IS DISTINCT FROM OLD.awaiting_reply_from
     OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
     OR NEW.acknowledged_by_advisor_id IS DISTINCT FROM OLD.acknowledged_by_advisor_id
     OR NEW.last_member_message_at IS DISTINCT FROM OLD.last_member_message_at
     OR NEW.last_advisor_reply_at IS DISTINCT FROM OLD.last_advisor_reply_at
     OR NEW.conversation_status IS DISTINCT FROM OLD.conversation_status
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.resolved_by_advisor_id IS DISTINCT FROM OLD.resolved_by_advisor_id
     OR NEW.follow_up_at IS DISTINCT FROM OLD.follow_up_at
     OR NEW.last_message_at IS DISTINCT FROM OLD.last_message_at
  THEN
    RAISE EXCEPTION 'conversation ops fields are not member-mutable';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_protect_group_conversation_ops
  BEFORE UPDATE ON public.group_conversations
  FOR EACH ROW EXECUTE FUNCTION public.protect_group_conversation_ops_fields();

-- 6. Enable realtime for group_conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_conversations;
