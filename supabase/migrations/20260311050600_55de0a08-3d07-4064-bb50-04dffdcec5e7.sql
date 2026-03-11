
-- Add follow_up_at column to conversations
ALTER TABLE public.conversations ADD COLUMN follow_up_at timestamptz;

-- Update the reply state trigger to clear follow_up_at on any new message
CREATE OR REPLACE FUNCTION public.update_conversation_reply_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      resolved_by_advisor_id = NULL,
      follow_up_at = NULL
    WHERE id = NEW.conversation_id;
  ELSE
    UPDATE public.conversations SET
      awaiting_reply_from = 'advisor',
      last_member_message_at = NEW.created_at,
      acknowledged_at = NULL,
      acknowledged_by_advisor_id = NULL,
      conversation_status = 'open',
      resolved_at = NULL,
      resolved_by_advisor_id = NULL,
      follow_up_at = NULL
    WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Update the protection trigger to block member changes to follow_up_at
CREATE OR REPLACE FUNCTION public.protect_conversation_ops_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     OR NEW.follow_up_at IS DISTINCT FROM OLD.follow_up_at
  THEN
    RAISE EXCEPTION 'conversation ops fields are not member-mutable';
  END IF;
  RETURN NEW;
END;
$function$;
