
-- Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill existing profiles with email from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND p.email IS NULL;

-- Update handle_new_user() to also store email
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
  -- Opret profil (now includes email)
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);

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

    UPDATE public.company_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = invite_record.id;
  ELSE
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
