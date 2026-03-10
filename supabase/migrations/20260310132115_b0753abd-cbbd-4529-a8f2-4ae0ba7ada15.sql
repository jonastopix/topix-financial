
-- Normalize all existing company_invitations emails to trim+lowercase
UPDATE public.company_invitations
SET email = lower(trim(email))
WHERE email IS DISTINCT FROM lower(trim(email));

-- Create trigger to auto-normalize email on insert/update
CREATE OR REPLACE FUNCTION public.normalize_invitation_email()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_normalize_invitation_email
  BEFORE INSERT OR UPDATE ON public.company_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_invitation_email();
