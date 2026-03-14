
CREATE OR REPLACE FUNCTION public.get_all_advisor_profiles()
RETURNS TABLE(user_id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.user_id, p.full_name, p.avatar_url
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role IN ('advisor'::app_role, 'admin'::app_role)
$$;
