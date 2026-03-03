
-- Public function to look up company name from invite token (no auth required)
CREATE OR REPLACE FUNCTION public.lookup_invite_company(invite_token uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.name
  FROM public.company_invitations ci
  JOIN public.companies c ON c.id = ci.company_id
  WHERE ci.token = invite_token AND ci.status = 'pending'
  LIMIT 1
$$;
