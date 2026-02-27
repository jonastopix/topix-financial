
-- Update handle_new_user to reuse existing company conversation
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_company_id uuid;
  invite_record record;
  advisor_invite record;
  existing_conv_id uuid;
BEGIN
  -- Opret profil
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Check for pending advisor invitation
  SELECT * INTO advisor_invite
  FROM public.advisor_invitations
  WHERE lower(trim(email)) = lower(trim(NEW.email)) AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'advisor')
    ON CONFLICT DO NOTHING;

    UPDATE public.advisor_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = advisor_invite.id;

    RETURN NEW;
  END IF;

  -- Check for pending company invitation
  SELECT * INTO invite_record
  FROM public.company_invitations
  WHERE lower(trim(email)) = lower(trim(NEW.email)) AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Tilknyt bruger til eksisterende virksomhed
    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (invite_record.company_id, NEW.id, 'member');

    -- Check if company already has a conversation
    SELECT id INTO existing_conv_id
    FROM public.conversations
    WHERE company_id = invite_record.company_id
    LIMIT 1;

    -- Only create conversation if company doesn't have one
    IF existing_conv_id IS NULL THEN
      INSERT INTO public.conversations (member_id, company_id)
      VALUES (NEW.id, invite_record.company_id);
    END IF;

    UPDATE public.company_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = invite_record.id;
  ELSE
    -- Opret ny virksomhed
    INSERT INTO public.companies (name)
    VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''), COALESCE(NEW.raw_user_meta_data->>'full_name', '') || 's virksomhed'))
    RETURNING id INTO new_company_id;

    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (new_company_id, NEW.id, 'owner');

    INSERT INTO public.conversations (member_id, company_id)
    VALUES (NEW.id, new_company_id);
  END IF;

  RETURN NEW;
END;
$function$;

-- Update messages RLS: let company members access messages in their company's conversations
DROP POLICY IF EXISTS "Members can view own messages" ON public.messages;
CREATE POLICY "Members can view own messages" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (conversations.member_id = auth.uid() OR conversations.company_id = user_company_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Members can insert in own conversation" ON public.messages;
CREATE POLICY "Members can insert in own conversation" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (conversations.member_id = auth.uid() OR conversations.company_id = user_company_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Members can update own conversation messages" ON public.messages;
CREATE POLICY "Members can update own conversation messages" ON public.messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (conversations.member_id = auth.uid() OR conversations.company_id = user_company_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Members can delete own conversation messages" ON public.messages;
CREATE POLICY "Members can delete own conversation messages" ON public.messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (conversations.member_id = auth.uid() OR conversations.company_id = user_company_id(auth.uid()))
    )
  );
