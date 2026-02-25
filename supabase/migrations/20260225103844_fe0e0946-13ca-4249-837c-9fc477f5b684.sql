
-- Invitations table
CREATE TABLE public.company_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(company_id, email)
);

ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

-- Company members can view their company's invitations
CREATE POLICY "Company members can view company invitations"
ON public.company_invitations FOR SELECT
USING (company_id = user_company_id(auth.uid()));

-- Company members can create invitations for their company
CREATE POLICY "Company members can insert company invitations"
ON public.company_invitations FOR INSERT
WITH CHECK (company_id = user_company_id(auth.uid()));

-- Company members can delete (cancel) invitations
CREATE POLICY "Company members can delete company invitations"
ON public.company_invitations FOR DELETE
USING (company_id = user_company_id(auth.uid()));

-- Company members can update invitations (for resend etc)
CREATE POLICY "Company members can update company invitations"
ON public.company_invitations FOR UPDATE
USING (company_id = user_company_id(auth.uid()));

-- Advisors can view all
CREATE POLICY "Advisors can view all invitations"
ON public.company_invitations FOR SELECT
USING (has_role(auth.uid(), 'advisor'::app_role));

-- Anyone can read invitations by token (for accepting)
CREATE POLICY "Anyone can read invitation by token"
ON public.company_invitations FOR SELECT
USING (true);

-- Update handle_new_user to check for pending invitations
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id uuid;
  invite_record record;
BEGIN
  -- Opret profil
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Check for pending invitation
  SELECT * INTO invite_record
  FROM public.company_invitations
  WHERE email = NEW.email AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF invite_record IS NOT NULL THEN
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
$$;
