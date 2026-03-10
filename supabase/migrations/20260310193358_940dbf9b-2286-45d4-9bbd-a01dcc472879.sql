-- Security Patch 6: Tighten RLS on messages — UPDATE and DELETE

-- 1) Drop overly broad member mutation policies
DROP POLICY "Members can update own conversation messages" ON public.messages;
DROP POLICY "Members can delete own conversation messages" ON public.messages;

-- 2) Replace with sender-scoped member policies
CREATE POLICY "Members can update own messages"
ON public.messages FOR UPDATE TO public
USING (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND (conversations.member_id = auth.uid()
         OR conversations.company_id = user_company_id(auth.uid()))
  )
)
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND (conversations.member_id = auth.uid()
         OR conversations.company_id = user_company_id(auth.uid()))
  )
);

CREATE POLICY "Members can delete own messages"
ON public.messages FOR DELETE TO public
USING (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND (conversations.member_id = auth.uid()
         OR conversations.company_id = user_company_id(auth.uid()))
  )
);

-- 3) Protect immutable fields via trigger
CREATE OR REPLACE FUNCTION public.protect_message_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
    RAISE EXCEPTION 'sender_id cannot be changed';
  END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
    RAISE EXCEPTION 'conversation_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_message_immutable_fields
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.protect_message_immutable_fields();