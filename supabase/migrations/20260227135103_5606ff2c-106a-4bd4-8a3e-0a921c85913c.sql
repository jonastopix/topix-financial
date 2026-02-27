-- Table for pending advisor invitations
CREATE TABLE public.advisor_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.advisor_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view advisor invitations"
  ON public.advisor_invitations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Advisors can insert advisor invitations"
  ON public.advisor_invitations FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Advisors can update advisor invitations"
  ON public.advisor_invitations FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Advisors can delete advisor invitations"
  ON public.advisor_invitations FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- Update handle_new_user to check for advisor invitations
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
    -- Assign advisor role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'advisor')
    ON CONFLICT DO NOTHING;

    -- Mark advisor invitation as accepted
    UPDATE public.advisor_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = advisor_invite.id;

    RETURN NEW;
  END IF;

  -- Check for pending company invitation (case-insensitive + trimmed)
  SELECT * INTO invite_record
  FROM public.company_invitations
  WHERE lower(trim(email)) = lower(trim(NEW.email)) AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
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
  ELSE
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