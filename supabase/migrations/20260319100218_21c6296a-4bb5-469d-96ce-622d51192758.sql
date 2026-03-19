CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id uuid;
  invite_record record;
  advisor_invite record;
  existing_conv_id uuid;
  invite_token_val text;
  _company_name text;
BEGIN
  -- Opret profil (includes email)
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);

  -- Check for pending advisor invitation (email-based)
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

  -- Company name helper
  _company_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      split_part(NEW.email, '@', 1),
      'Ny bruger'
    ) || 's virksomhed'
  );

  IF FOUND THEN
    IF invite_record.company_id IS NOT NULL THEN
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
      -- Standalone invitation (no company_id) — create new company
      INSERT INTO public.companies (name)
      VALUES (_company_name)
      RETURNING id INTO new_company_id;

      INSERT INTO public.company_members (company_id, user_id, role)
      VALUES (new_company_id, NEW.id, 'owner');

      INSERT INTO public.conversations (member_id, company_id)
      VALUES (NEW.id, new_company_id);
    END IF;

    -- Mark invitation as accepted
    UPDATE public.company_invitations
    SET status = 'accepted', accepted_at = now(), accepted_by = NEW.id
    WHERE id = invite_record.id;
  END IF;
  -- No invitation found: user gets a profile but NO company.
  -- They cannot access any data without a company membership.

  RETURN NEW;
END;
$$;