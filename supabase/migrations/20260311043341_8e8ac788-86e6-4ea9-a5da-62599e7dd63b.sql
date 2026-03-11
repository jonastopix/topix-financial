
-- Add conversation resolved state columns
ALTER TABLE public.conversations
  ADD COLUMN conversation_status text NOT NULL DEFAULT 'open',
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolved_by_advisor_id uuid;

-- CHECK constraint for valid status values
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_status_check CHECK (conversation_status IN ('open', 'resolved'));

-- Update trigger: both branches reopen resolved conversations on any new real message
CREATE OR REPLACE FUNCTION public.update_conversation_reply_state()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  sender_is_advisor boolean;
BEGIN
  IF NEW.message_type IS DISTINCT FROM 'user' THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.sender_id AND role IN ('advisor','admin')
  ) INTO sender_is_advisor;

  PERFORM set_config('app.allow_conversation_ops_update', '1', true);

  IF sender_is_advisor THEN
    UPDATE public.conversations SET
      awaiting_reply_from = 'company',
      last_advisor_reply_at = NEW.created_at,
      acknowledged_at = NULL,
      acknowledged_by_advisor_id = NULL,
      assigned_advisor_id = COALESCE(assigned_advisor_id, NEW.sender_id),
      conversation_status = 'open',
      resolved_at = NULL,
      resolved_by_advisor_id = NULL
    WHERE id = NEW.conversation_id;
  ELSE
    UPDATE public.conversations SET
      awaiting_reply_from = 'advisor',
      last_member_message_at = NEW.created_at,
      acknowledged_at = NULL,
      acknowledged_by_advisor_id = NULL,
      conversation_status = 'open',
      resolved_at = NULL,
      resolved_by_advisor_id = NULL
    WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Update protect trigger to block member mutation of resolved fields
CREATE OR REPLACE FUNCTION public.protect_conversation_ops_fields()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.allow_conversation_ops_update', true) = '1' THEN
    RETURN NEW;
  END IF;
  IF has_role(auth.uid(), 'advisor'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_advisor_id IS DISTINCT FROM OLD.assigned_advisor_id
     OR NEW.awaiting_reply_from IS DISTINCT FROM OLD.awaiting_reply_from
     OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
     OR NEW.acknowledged_by_advisor_id IS DISTINCT FROM OLD.acknowledged_by_advisor_id
     OR NEW.last_member_message_at IS DISTINCT FROM OLD.last_member_message_at
     OR NEW.last_advisor_reply_at IS DISTINCT FROM OLD.last_advisor_reply_at
     OR NEW.conversation_status IS DISTINCT FROM OLD.conversation_status
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.resolved_by_advisor_id IS DISTINCT FROM OLD.resolved_by_advisor_id
  THEN
    RAISE EXCEPTION 'conversation ops fields are not member-mutable';
  END IF;
  RETURN NEW;
END;
$$;

-- Update validation trigger: TG_OP-safe, symmetric resolved fields
CREATE OR REPLACE FUNCTION public.validate_conversation_advisor_assignment()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    -- Symmetric resolved: both NULL or both set
    IF (NEW.resolved_at IS NULL) != (NEW.resolved_by_advisor_id IS NULL) THEN
      RAISE EXCEPTION 'resolved_at and resolved_by_advisor_id must both be set or both be null';
    END IF;
    -- Validate resolved_by_advisor_id if set (no OLD reference in INSERT)
    IF NEW.resolved_by_advisor_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = NEW.resolved_by_advisor_id AND role IN ('advisor','admin')
      ) THEN
        RAISE EXCEPTION 'resolved_by_advisor_id must reference an advisor or admin';
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
    -- Symmetric resolved: both NULL or both set
    IF (NEW.resolved_at IS NULL) != (NEW.resolved_by_advisor_id IS NULL) THEN
      RAISE EXCEPTION 'resolved_at and resolved_by_advisor_id must both be set or both be null';
    END IF;
    -- Validate resolved_by_advisor_id only when changed
    IF NEW.resolved_by_advisor_id IS NOT NULL
       AND NEW.resolved_by_advisor_id IS DISTINCT FROM OLD.resolved_by_advisor_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = NEW.resolved_by_advisor_id AND role IN ('advisor','admin')
      ) THEN
        RAISE EXCEPTION 'resolved_by_advisor_id must reference an advisor or admin';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
