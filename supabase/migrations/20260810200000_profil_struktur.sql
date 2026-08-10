-- Migration: profilstruktur — fra identitet til ERFARING
-- Et netværk bruges kun, hvis man ved hvem man skal SPØRGE — ikke hvem
-- folk er. "Bio" beskriver identitet; de nye felter beskriver erfaring:
--   ask_me_about  — "Det kan du spørge mig om" (bærende felt, egne ord)
--   working_on    — "Det arbejder jeg med lige nu" (+ friskheds-stempel)
-- expertise BEVARES som filtreringslag (søgning/chips); companies får
-- description, så virksomheden kan stå i én sætning uden at misbruge
-- industry_label.
--
-- ⚠️ CREATE OR REPLACE kan IKKE bruges til RPC'erne her: kolonnesættet
-- (returtypen) ændres, og Postgres afviser det med "cannot change return
-- type of existing function". Derfor DROP + CREATE — og grants gen-
-- tildeles eksplicit til sidst (DROP fjerner dem).
--
-- Alle eksisterende filtre er bevaret ORDRET fra 20260810180000:
-- aktivt medlemskab (is_membership_active), legat-udelukkelse
-- (spejler useAuth: legat_enrollments.status IN ('active','completed'),
-- advisors undtaget) og advisor-UNION i directory. get_member_profile
-- er fortsat ufiltreret (direkte opslag skal virke).
--
-- DEPLOY: køres MANUELT i Lovable -> SQL editor efter merge (migrationer
-- auto-deployer aldrig). Kør FØR frontend-"Update" der bruger de nye
-- felter. Verificér med:
--   SELECT pg_get_functiondef('public.get_member_profile(uuid)'::regprocedure);

-- ── 1) member_profiles: erfaring ind, bio ud ──

ALTER TABLE public.member_profiles
  ADD COLUMN IF NOT EXISTS ask_me_about text,
  ADD COLUMN IF NOT EXISTS working_on text,
  ADD COLUMN IF NOT EXISTS working_on_updated_at timestamptz;

COMMENT ON COLUMN public.member_profiles.ask_me_about IS '"Det kan du spørge mig om" — to-tre sætninger i egne ord; profilens bærende felt';
COMMENT ON COLUMN public.member_profiles.working_on IS '"Det arbejder jeg med lige nu"';
COMMENT ON COLUMN public.member_profiles.working_on_updated_at IS 'Sættes af frontend når working_on ændres — bruges til friskheds-visning';

-- Bio-indholdet flyttes til ask_me_about (kun hvor det ikke overskriver).
--
-- FØR-verifikation:
--   SELECT user_id, left(bio, 60) AS bio, left(ask_me_about, 60) AS ask_me_about
--   FROM public.member_profiles
--   WHERE bio IS NOT NULL
--   ORDER BY user_id;

UPDATE public.member_profiles
SET ask_me_about = bio
WHERE bio IS NOT NULL AND ask_me_about IS NULL;

-- EFTER-verifikation (skal give 0 rækker — alt bio-indhold er båret over):
--   SELECT user_id FROM public.member_profiles
--   WHERE bio IS NOT NULL AND (ask_me_about IS NULL OR ask_me_about = '');

ALTER TABLE public.member_profiles DROP COLUMN bio;

-- ── 2) companies.description — virksomheden i én sætning ──
-- industry_label misbruges i dag til dette af nogle virksomheder
-- (fx "DTC hudpleje e-commerce" er en beskrivelse, ikke en branche).
-- De oprindelige fritekster ligger bevaret i
-- application_context.legacy_industry_text fra backfill'en 2026-08-10,
-- så en senere oprydning af industry_label kan ske uden datatab.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.companies.description IS 'Virksomheden i én sætning — vises på medlemsprofilen';

-- ── 3) Visnings-RPC'erne genskabes med det nye kolonnesæt ──
-- Nyt fælles kolonnesæt (member_since = MIN(created_at) fra
-- company_members; rådgivere har ingen rækker dér → NULL af sig selv):
--   user_id, full_name, avatar_url, company_name, industry_label,
--   company_description, website, linkedin_url, expertise,
--   ask_me_about, working_on, working_on_updated_at, member_since,
--   is_advisor

DROP FUNCTION public.get_member_profile(uuid);
DROP FUNCTION public.get_event_participants(uuid);
DROP FUNCTION public.get_member_directory();

-- ── RPC 1: get_member_profile — ufiltreret direkte opslag ──

CREATE FUNCTION public.get_member_profile(p_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_url text,
  company_name text,
  industry_label text,
  company_description text,
  website text,
  linkedin_url text,
  expertise text[],
  ask_me_about text,
  working_on text,
  working_on_updated_at timestamptz,
  member_since timestamptz,
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
    c.description,
    c.website,
    mp.linkedin_url,
    COALESCE(mp.expertise, '{}'::text[]),
    mp.ask_me_about,
    mp.working_on,
    mp.working_on_updated_at,
    (SELECT MIN(cm.created_at) FROM public.company_members cm WHERE cm.user_id = p.user_id),
    public.has_role(p.user_id, 'advisor')
  FROM public.profiles p
  LEFT JOIN public.companies c ON c.id = public.user_company_id(p.user_id)
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE p.user_id = p_user_id
$$;

-- ── RPC 2: get_event_participants — filtre ordret fra 20260810180000 ──

CREATE FUNCTION public.get_event_participants(p_event_id uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_url text,
  company_name text,
  industry_label text,
  company_description text,
  website text,
  linkedin_url text,
  expertise text[],
  ask_me_about text,
  working_on text,
  working_on_updated_at timestamptz,
  member_since timestamptz,
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
    c.description,
    c.website,
    mp.linkedin_url,
    COALESCE(mp.expertise, '{}'::text[]),
    mp.ask_me_about,
    mp.working_on,
    mp.working_on_updated_at,
    (SELECT MIN(cm2.created_at) FROM public.company_members cm2 WHERE cm2.user_id = p.user_id),
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

-- ── RPC 3: get_member_directory — filtre + advisor-UNION ordret ──

CREATE FUNCTION public.get_member_directory()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_url text,
  company_name text,
  industry_label text,
  company_description text,
  website text,
  linkedin_url text,
  expertise text[],
  ask_me_about text,
  working_on text,
  working_on_updated_at timestamptz,
  member_since timestamptz,
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
    c.description,
    c.website,
    mp.linkedin_url,
    COALESCE(mp.expertise, '{}'::text[]),
    mp.ask_me_about,
    mp.working_on,
    mp.working_on_updated_at,
    (SELECT MIN(cm2.created_at) FROM public.company_members cm2 WHERE cm2.user_id = p.user_id),
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
    NULL::text,
    mp.linkedin_url,
    COALESCE(mp.expertise, '{}'::text[]),
    mp.ask_me_about,
    mp.working_on,
    mp.working_on_updated_at,
    NULL::timestamptz,  -- member_since: null for rådgivere
    true AS is_advisor
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE ur.role IN ('advisor'::app_role, 'admin'::app_role)
  ORDER BY is_advisor, full_name, user_id
$$;

-- ── Grants gen-tildeles (DROP fjernede dem) — mønstret fra 20260810120000 ──

REVOKE ALL ON FUNCTION public.get_member_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_member_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_member_profile(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_event_participants(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_participants(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_participants(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_member_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_member_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_member_directory() TO authenticated;
