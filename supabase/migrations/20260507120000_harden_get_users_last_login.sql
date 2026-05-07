-- BACKLOG.md punkt #1 (P0): get_users_last_login lækkede auth-metadata
-- til alle authenticated brugere.
--
-- Den oprindelige version (migration 20260421212827) gav EXECUTE til
-- enhver authenticated bruger og filtrerede kun input på id = ANY(...).
-- Dermed kunne enhver med en liste af UUIDs aggregere last_sign_in_at
-- og email_confirmed_at fra auth.users — også for brugere i andre
-- companies.
--
-- Funktionen kaldes i dag kun fra src/pages/Members.tsx (advisor-route).
-- Vi gater derfor bodyen direkte på has_role(auth.uid(), 'advisor').
-- Når caller ikke er advisor returneres 0 rækker. EXECUTE-grant beholdes;
-- sikkerheden ligger nu i bodyen, ikke i grantet.
--
-- STABLE tilføjes for at matche has_role/user_company_id-mønstret.

CREATE OR REPLACE FUNCTION public.get_users_last_login(user_ids uuid[])
RETURNS TABLE (user_id uuid, last_sign_in_at timestamptz, email_confirmed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id AS user_id, last_sign_in_at, email_confirmed_at
  FROM auth.users
  WHERE id = ANY(user_ids)
    AND has_role(auth.uid(), 'advisor'::app_role);
$$;

COMMENT ON FUNCTION public.get_users_last_login(uuid[]) IS
  'Advisor-only by design. Body enforces has_role(auth.uid(), ''advisor''::app_role); '
  'returns 0 rows for non-advisor callers even though EXECUTE is granted to '
  'authenticated. See BACKLOG.md punkt #1 and SECURITY_BASELINE.md afsnit 1.';
