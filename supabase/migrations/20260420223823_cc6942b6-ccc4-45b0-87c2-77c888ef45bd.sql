CREATE OR REPLACE FUNCTION public.mark_messages_read(p_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  affected integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id
    AND (
      member_id = caller
      OR company_id = user_company_id(caller)
      OR has_role(caller, 'advisor'::app_role)
    )
  ) THEN
    RAISE EXCEPTION 'Access denied to conversation';
  END IF;

  -- Mark user, system and AI messages as read (not own messages)
  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id != caller
    AND read_at IS NULL
    AND message_type IN ('user', 'system', 'ai');

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;