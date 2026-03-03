
-- Make company_id nullable in company_invitations
ALTER TABLE public.company_invitations ALTER COLUMN company_id DROP NOT NULL;

-- Update handle_new_user to handle invitations without company_id
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
  invite_token_val text;
BEGIN
  -- Opret profil (includes email)
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);

  -- Check for pending advisor invitation (email-based, unchanged)
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

  -- 1) Token-based invitation lookup (highest priority)
  invite_token_val := NEW.raw_user_meta_data->>'invite_token';
  IF invite_token_val IS NOT NULL AND invite_token_val != '' THEN
    SELECT * INTO invite_record
    FROM public.company_invitations
    WHERE token = invite_token_val::uuid AND status = 'pending'
    LIMIT 1;
  END IF;

  -- 2) Fallback: email-based invitation lookup
  IF NOT FOUND THEN
    SELECT * INTO invite_record
    FROM public.company_invitations
    WHERE lower(trim(email)) = lower(trim(NEW.email)) AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF FOUND THEN
    -- Check if invitation has a company_id (advisor-created) or not (Monday webhook)
    IF invite_record.company_id IS NOT NULL THEN
      -- Existing behavior: pair user with the pre-created company
      INSERT INTO public.company_members (company_id, user_id, role)
      VALUES (invite_record.company_id, NEW.id, 'member');

      SELECT id INTO existing_conv_id
      FROM public.conversations
      WHERE company_id = invite_record.company_id
      LIMIT 1;

      IF existing_conv_id IS NULL THEN
        INSERT INTO public.conversations (member_id, company_id)
        VALUES (NEW.id, invite_record.company_id);
      END IF;
    ELSE
      -- No company_id: create a new company for the user (Monday webhook flow)
      INSERT INTO public.companies (name)
      VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''), COALESCE(NEW.raw_user_meta_data->>'full_name', '') || 's virksomhed'))
      RETURNING id INTO new_company_id;

      INSERT INTO public.company_members (company_id, user_id, role)
      VALUES (new_company_id, NEW.id, 'owner');

      INSERT INTO public.conversations (member_id, company_id)
      VALUES (NEW.id, new_company_id);
    END IF;

    -- Mark invitation as accepted regardless
    UPDATE public.company_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = invite_record.id;
  ELSE
    -- No invitation found: create new company (organic signup)
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
