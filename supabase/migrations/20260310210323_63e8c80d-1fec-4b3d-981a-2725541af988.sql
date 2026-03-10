
CREATE OR REPLACE FUNCTION public.lookup_invite_company_info(invite_token uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'name', c.name,
    'logo_url', c.logo_url
  )
  FROM public.company_invitations ci
  JOIN public.companies c ON c.id = ci.company_id
  WHERE ci.token = invite_token AND ci.status = 'pending'
  LIMIT 1
$$;
