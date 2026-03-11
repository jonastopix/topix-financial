
-- =============================================
-- Advisor Chat Operating System — Batch 1
-- =============================================

-- 1. Add 6 operational columns to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_advisor_id uuid,
  ADD COLUMN IF NOT EXISTS awaiting_reply_from text,
  ADD COLUMN IF NOT EXISTS last_member_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_advisor_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by_advisor_id uuid;

-- Add CHECK constraint on awaiting_reply_from
ALTER TABLE public.conversations
  ADD CONSTRAINT chk_awaiting_reply_from
  CHECK (awaiting_reply_from IS NULL OR awaiting_reply_from IN ('advisor', 'company'));

-- 2. Protection trigger: block member mutations on ops fields
CREATE OR REPLACE FUNCTION public.protect_conversation_ops_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Allow system-trigger updates via session flag
  IF current_setting('app.allow_conversation_ops_update', true) = '1' THEN
    RETURN NEW;
  END IF;
  -- Allow advisors/admins
  IF has_role(auth.uid(), 'advisor'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Block member mutations on operational fields
  IF NEW.assigned_advisor_id IS DISTINCT FROM OLD.assigned_advisor_id
     OR NEW.awaiting_reply_from IS DISTINCT FROM OLD.awaiting_reply_from
     OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
     OR NEW.acknowledged_by_advisor_id IS DISTINCT FROM OLD.acknowledged_by_advisor_id
     OR NEW.last_member_message_at IS DISTINCT FROM OLD.last_member_message_at
     OR NEW.last_advisor_reply_at IS DISTINCT FROM OLD.last_advisor_reply_at
  THEN
    RAISE EXCEPTION 'conversation ops fields are not member-mutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_conversation_ops_fields
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.protect_conversation_ops_fields();

-- 3. Validation trigger: validate advisor IDs + ack symmetry (TG_OP-aware)
CREATE OR REPLACE FUNCTION public.validate_conversation_advisor_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Validate assigned_advisor_id if set
    IF NEW.assigned_advisor_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = NEW.assigned_advisor_id AND role IN ('advisor','admin')
      ) THEN
        RAISE EXCEPTION 'assigned_advisor_id must reference an advisor or admin';
      END IF;
    END IF;
    -- Symmetric ack: both NULL or both set
    IF (NEW.acknowledged_at IS NULL) != (NEW.acknowledged_by_advisor_id IS NULL) THEN
      RAISE EXCEPTION 'acknowledged_at and acknowledged_by_advisor_id must both be set or both be null';
    END IF;
    -- Validate acknowledged_by_advisor_id if set
    IF NEW.acknowledged_by_advisor_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = NEW.acknowledged_by_advisor_id AND role IN ('advisor','admin')
      ) THEN
        RAISE EXCEPTION 'acknowledged_by_advisor_id must reference an advisor or admin';
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Validate assigned_advisor_id only when changed
    IF NEW.assigned_advisor_id IS NOT NULL
       AND NEW.assigned_advisor_id IS DISTINCT FROM OLD.assigned_advisor_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = NEW.assigned_advisor_id AND role IN ('advisor','admin')
      ) THEN
        RAISE EXCEPTION 'assigned_advisor_id must reference an advisor or admin';
      END IF;
    END IF;
    -- Symmetric ack: both NULL or both set
    IF (NEW.acknowledged_at IS NULL) != (NEW.acknowledged_by_advisor_id IS NULL) THEN
      RAISE EXCEPTION 'acknowledged_at and acknowledged_by_advisor_id must both be set or both be null';
    END IF;
    -- Validate acknowledged_by_advisor_id only when changed
    IF NEW.acknowledged_by_advisor_id IS NOT NULL
       AND NEW.acknowledged_by_advisor_id IS DISTINCT FROM OLD.acknowledged_by_advisor_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = NEW.acknowledged_by_advisor_id AND role IN ('advisor','admin')
      ) THEN
        RAISE EXCEPTION 'acknowledged_by_advisor_id must reference an advisor or admin';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_advisor_assignment
  BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.validate_conversation_advisor_assignment();

-- 4. Reply state trigger: auto-update on message INSERT
CREATE OR REPLACE FUNCTION public.update_conversation_reply_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  sender_is_advisor boolean;
BEGIN
  IF NEW.message_type IS DISTINCT FROM 'user' THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.sender_id AND role IN ('advisor','admin')
  ) INTO sender_is_advisor;

  -- Set session flag so protect_conversation_ops_fields allows this update
  PERFORM set_config('app.allow_conversation_ops_update', '1', true);

  IF sender_is_advisor THEN
    UPDATE public.conversations SET
      awaiting_reply_from = 'company',
      last_advisor_reply_at = NEW.created_at,
      acknowledged_at = NULL,
      acknowledged_by_advisor_id = NULL,
      assigned_advisor_id = COALESCE(assigned_advisor_id, NEW.sender_id)
    WHERE id = NEW.conversation_id;
  ELSE
    UPDATE public.conversations SET
      awaiting_reply_from = 'advisor',
      last_member_message_at = NEW.created_at,
      acknowledged_at = NULL,
      acknowledged_by_advisor_id = NULL
    WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_conversation_reply_state
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_reply_state();

-- 5. Backfill existing conversations from message history
SELECT set_config('app.allow_conversation_ops_update', '1', true);

WITH last_human AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id, m.sender_id, m.created_at,
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = m.sender_id AND ur.role IN ('advisor','admin')) AS is_advisor
  FROM public.messages m
  WHERE m.message_type = 'user'
  ORDER BY m.conversation_id, m.created_at DESC
),
member_ts AS (
  SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.created_at AS ts
  FROM public.messages m
  WHERE m.message_type = 'user'
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = m.sender_id AND ur.role IN ('advisor','admin'))
  ORDER BY m.conversation_id, m.created_at DESC
),
advisor_ts AS (
  SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.created_at AS ts
  FROM public.messages m
  WHERE m.message_type = 'user'
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = m.sender_id AND ur.role IN ('advisor','admin'))
  ORDER BY m.conversation_id, m.created_at DESC
)
UPDATE public.conversations c SET
  awaiting_reply_from = CASE WHEN lh.is_advisor THEN 'company' ELSE 'advisor' END,
  last_member_message_at = mt.ts,
  last_advisor_reply_at = at.ts
FROM last_human lh
LEFT JOIN member_ts mt ON mt.conversation_id = lh.conversation_id
LEFT JOIN advisor_ts at ON at.conversation_id = lh.conversation_id
WHERE c.id = lh.conversation_id;

-- 6. Enable realtime for conversations (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
