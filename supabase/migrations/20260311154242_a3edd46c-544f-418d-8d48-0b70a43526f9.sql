
CREATE OR REPLACE FUNCTION public.get_conversation_sender_profiles(_conversation_id uuid)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, is_advisor boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (p.user_id)
    p.user_id,
    p.full_name,
    p.avatar_url,
    EXISTS(
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.user_id
      AND ur.role IN ('advisor'::app_role, 'admin'::app_role)
    ) AS is_advisor
  FROM public.messages m
  JOIN public.profiles p ON p.user_id = m.sender_id
  WHERE m.conversation_id = _conversation_id
    AND m.message_type = 'user'
    AND EXISTS(
      SELECT 1 FROM public.conversations c
      WHERE c.id = _conversation_id
      AND (
        c.member_id = auth.uid()
        OR c.company_id = user_company_id(auth.uid())
        OR has_role(auth.uid(), 'advisor'::app_role)
      )
    )
$$;
