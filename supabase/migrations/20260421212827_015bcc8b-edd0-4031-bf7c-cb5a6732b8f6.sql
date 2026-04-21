CREATE OR REPLACE FUNCTION public.get_users_last_login(user_ids uuid[])
RETURNS TABLE (user_id uuid, last_sign_in_at timestamptz, email_confirmed_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id AS user_id, last_sign_in_at, email_confirmed_at
  FROM auth.users WHERE id = ANY(user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_users_last_login(uuid[]) TO authenticated;