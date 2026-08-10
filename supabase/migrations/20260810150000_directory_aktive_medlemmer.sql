-- Migration: is_membership_active + medlemskabsfilter på directory/deltagere
-- De tre member-RPC'er fra 20260810120000 (PR #245) filtrerer ikke på
-- medlemskab og viser derfor tidligere medlemmer i netværket og på
-- deltagerlister (prod: Sebastian & Amalie, Coskun Holding, Capture IT).
--
-- computeMembershipTier er den kanoniske tier-beregning, men er TypeScript
-- og kan ikke kaldes fra SQL — derfor en SQL-spejling her (kopi nr. 3).
--
-- FILTRERES: get_member_directory (kun medlemsgrenen — rådgivere har ingen
-- virksomhed) og get_event_participants.
-- FILTRERES IKKE: get_member_profile — en profil skal stadig kunne slås op
-- direkte, fx fra en historisk deltagerliste.
--
-- DEPLOY: køres MANUELT i Lovable -> SQL editor efter merge (migrationer
-- auto-deployer aldrig). Verificér med:
--   SELECT public.is_membership_active(NULL);                        -- true
--   SELECT pg_get_functiondef('public.get_member_directory()'::regprocedure);

-- ── 1) is_membership_active — SQL-spejling af computeMembershipTier ──
--
-- SPEJLET LOGIK — denne funktion er kopi nr. 3 af tier-beregningen:
--   1. src/lib/membershipTier.ts                       (kanonisk, frontend)
--   2. supabase/functions/_shared/membershipTier.ts    (Deno-spejl)
--   3. public.is_membership_active                     (denne, SQL)
-- Ændringer i tier-logikken SKAL spejles alle tre steder. Pariteten mellem
-- 1 og 2 håndhæves af src/lib/__tests__/membershipTier.test.ts.
--
-- Sandhedstabellen inkl. fail-open-reglerne fra useAuth (no_date → full,
-- manglende virksomhed → full):
--   p_company_id IS NULL eller ukendt virksomhed → true  (fail-open)
--   contract_end_date IS NULL                    → true  ("no_date")
--   contract_end_date > now()                    → true  ("full")
--   subscription_status = 'active'
--     AND subscription_current_period_end>now()  → true  ("subscriber")
--   ellers                                       → false ("expired")

CREATE OR REPLACE FUNCTION public.is_membership_active(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN c.contract_end_date IS NULL THEN true                 -- "no_date"
        WHEN c.contract_end_date > now() THEN true                 -- "full"
        WHEN c.subscription_status = 'active'
         AND c.subscription_current_period_end > now() THEN true   -- "subscriber"
        ELSE false                                                 -- "expired"
      END
      FROM public.companies c
      WHERE c.id = p_company_id
    ),
    true  -- p_company_id NULL eller virksomheden findes ikke → fail-open
  )
$$;

REVOKE ALL ON FUNCTION public.is_membership_active(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_membership_active(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_membership_active(uuid) TO authenticated;

-- ── 2a) get_member_directory — medlemsgrenen gates på aktivt medlemskab ──
-- Uændret ift. 20260810120000 pånær is_membership_active-prædikatet i
-- gren A. Gren B (rådgivere) filtreres BEVIDST ikke — rådgivere har ingen
-- virksomhed (user_company_id → NULL ville i øvrigt være fail-open true).

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

-- ── 2b) get_event_participants — deltagere gates på aktivt medlemskab ──
-- Uændret ift. 20260810120000 pånær is_membership_active-prædikatet.
-- Rådgivere på egne events forbliver synlige: user_company_id → NULL →
-- fail-open true.

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
  ORDER BY p.full_name
$$;

-- get_member_profile ændres BEVIDST ikke (direkte opslag skal virke for
-- historiske deltagere). Grants på de to genskabte funktioner bevares af
-- CREATE OR REPLACE (EXECUTE til authenticated, REVOKE'et fra PUBLIC/anon
-- i 20260810120000).
