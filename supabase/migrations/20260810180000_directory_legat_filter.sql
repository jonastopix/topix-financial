-- Migration: legat-filter på get_member_directory + get_event_participants
-- Legat-brugere hører ikke til medlemsnetværket — de har deres eget miljø
-- og sendes til /legat af MemberRoute. Alligevel optrådte de i directory
-- og på deltagerlister, fordi RPC'erne (20260810120000/20260810150000)
-- kun gater på aktivt medlemskab.
--
-- Filteret spejler useAuth.tsx' isLegat-betingelse ORDRET
-- (useAuth.tsx:135-147): legat = række i legat_enrollments med
-- status IN ('active','completed') — og KUN for ikke-advisors
-- (useAuth tvinger isLegat=false for advisors). Derfor:
--   - get_member_directory gren A: rent NOT EXISTS-prædikat (grenen
--     indeholder pr. definition kun ikke-advisors via NOT has_role).
--   - get_event_participants: advisors undtages eksplicit i prædikatet,
--     så spejlingen holder også for advisor-rækker.
-- get_member_profile filtreres IKKE — samme begrundelse som
-- medlemskabs-gaten: direkte opslag skal virke (fx historiske
-- deltagerlister).
--
-- DEPLOY: køres MANUELT i Lovable -> SQL editor efter merge (migrationer
-- auto-deployer aldrig). Verificér med:
--   SELECT pg_get_functiondef('public.get_member_directory()'::regprocedure);

-- ── get_member_directory — gren A gates også på ikke-legat ──
-- Uændret ift. 20260810150000 pånær NOT EXISTS-prædikatet i gren A.

CREATE OR REPLACE FUNCTION public.get_member_directory()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_url text,
  company_name text,
  industry_label text,
  website text,
  linkedin_url text,
  expertise text[],
  bio text,
  is_advisor boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.user_id,
    p.full_name,
    p.avatar_url,
    c.name,
    c.industry_label,
    c.website,
    mp.linkedin_url,
    COALESCE(mp.expertise, '{}'::text[]),
    mp.bio,
    false AS is_advisor
  FROM public.company_members cm
  JOIN public.profiles p ON p.user_id = cm.user_id
  LEFT JOIN public.companies c ON c.id = public.user_company_id(p.user_id)
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE NOT public.has_role(cm.user_id, 'advisor')
    AND public.is_membership_active(public.user_company_id(p.user_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.legat_enrollments le
      WHERE le.user_id = p.user_id
        AND le.status IN ('active', 'completed')
    )
  UNION
  SELECT
    p.user_id,
    p.full_name,
    p.avatar_url,
    NULL::text,
    NULL::text,
    NULL::text,
    mp.linkedin_url,
    COALESCE(mp.expertise, '{}'::text[]),
    mp.bio,
    true AS is_advisor
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE ur.role IN ('advisor'::app_role, 'admin'::app_role)
  ORDER BY is_advisor, full_name, user_id
$$;

-- ── get_event_participants — deltagere gates også på ikke-legat ──
-- Uændret ift. 20260810150000 pånær legat-prædikatet. Advisors undtages
-- eksplicit (has_role-OR), så spejlingen af useAuths `if (!isAdv)`-gate
-- holder også for rådgiver-rækker på egne events.

CREATE OR REPLACE FUNCTION public.get_event_participants(p_event_id uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_url text,
  company_name text,
  industry_label text,
  website text,
  linkedin_url text,
  expertise text[],
  bio text,
  is_advisor boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.user_id,
    p.full_name,
    p.avatar_url,
    c.name,
    c.industry_label,
    c.website,
    mp.linkedin_url,
    COALESCE(mp.expertise, '{}'::text[]),
    mp.bio,
    public.has_role(p.user_id, 'advisor')
  FROM public.event_registrations er
  JOIN public.profiles p ON p.user_id = er.user_id
  LEFT JOIN public.companies c ON c.id = public.user_company_id(p.user_id)
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE er.event_id = p_event_id
    AND er.cancelled_at IS NULL
    AND public.is_membership_active(public.user_company_id(p.user_id))
    AND (
      public.has_role(p.user_id, 'advisor')
      OR NOT EXISTS (
        SELECT 1 FROM public.legat_enrollments le
        WHERE le.user_id = p.user_id
          AND le.status IN ('active', 'completed')
      )
    )
  ORDER BY p.full_name
$$;

-- get_member_profile ændres BEVIDST ikke (direkte opslag skal virke).
-- Grants bevares af CREATE OR REPLACE (EXECUTE til authenticated,
-- REVOKE'et fra PUBLIC/anon i 20260810120000).
