-- Create debug log table
CREATE TABLE IF NOT EXISTS public.trigger_debug_log (
  id serial PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  message text
);

-- Recreate the trigger function with debug logging
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_company_id uuid;
  invite_record record;
  invite_count int;
BEGIN
  -- Debug: log the incoming email
  INSERT INTO public.trigger_debug_log (message) VALUES ('handle_new_user fired for email: ' || COALESCE(NEW.email, 'NULL'));

  -- Opret profil
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Count pending invitations for debug
  SELECT count(*) INTO invite_count
  FROM public.company_invitations
  WHERE email = NEW.email AND status = 'pending';

  INSERT INTO public.trigger_debug_log (message) VALUES ('Found ' || invite_count || ' pending invitations for email: ' || COALESCE(NEW.email, 'NULL'));

  -- Check for pending invitation
  SELECT * INTO invite_record
  FROM public.company_invitations
  WHERE email = NEW.email AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF invite_record IS NOT NULL THEN
    INSERT INTO public.trigger_debug_log (message) VALUES ('Matching invitation found: ' || invite_record.id || ' for company: ' || invite_record.company_id);

    -- Tilknyt bruger til eksisterende virksomhed
    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (invite_record.company_id, NEW.id, 'member');

    -- Opret conversation for virksomheden
    INSERT INTO public.conversations (member_id, company_id)
    VALUES (NEW.id, invite_record.company_id);

    -- Markér invitation som accepteret
    UPDATE public.company_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = invite_record.id;

    INSERT INTO public.trigger_debug_log (message) VALUES ('User linked to company successfully');
  ELSE
    INSERT INTO public.trigger_debug_log (message) VALUES ('No invitation found, creating new company');

    -- Opret ny virksomhed
    INSERT INTO public.companies (name)
    VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''), COALESCE(NEW.raw_user_meta_data->>'full_name', '') || 's virksomhed'))
    RETURNING id INTO new_company_id;

    -- Tilknyt bruger til virksomhed
    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (new_company_id, NEW.id, 'owner');

    -- Opret conversation for virksomheden
    INSERT INTO public.conversations (member_id, company_id)
    VALUES (NEW.id, new_company_id);
  END IF;

  RETURN NEW;
END;
$function$;