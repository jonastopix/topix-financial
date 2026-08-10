-- Migration: member_profiles + medlems-RPC'er
-- Medlemsprofil-laget: LinkedIn, ekspertise-tags og bio pr. bruger.
-- Branche og website bor BEVIDST på companies (industry_label/website) —
-- her gemmes kun det personlige. Navn/avatar bor fortsat i profiles.
--
-- RLS: self-only SELECT/INSERT/UPDATE (auth.uid() = user_id),
-- advisor-bred SELECT via has_role, service_role ALL. Ingen medlems-DELETE
-- (bevidst: profilen følger brugeren; oprydning sker via ON DELETE CASCADE
-- fra auth.users eller service-role).
--
-- RPC'erne følger get_all_advisor_profiles-mønstret (20260314211810):
-- LANGUAGE sql, STABLE SECURITY DEFINER, search_path = public.
-- Company-opslag går via user_company_id(uid) (SECURITY DEFINER-helperen,
-- kaldes kun — ændres ikke), så hver bruger giver præcis én række.
-- get_event_participants returnerer ALDRIG registered_at/cancelled_at —
-- kun deltagerlisten, ikke tilmeldingshistorik. Alle tre RPC'er har
-- is_advisor; get_member_directory tager rådgivere med via UNION-gren
-- (de står ikke i company_members).
--
-- DEPLOY: køres MANUELT i Lovable -> SQL editor efter merge (migrationer
-- auto-deployer aldrig). Verificér med:
--   SELECT pg_get_functiondef('public.get_member_profile(uuid)'::regprocedure);

-- ── Tabel ──

CREATE TABLE public.member_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_url TEXT,
  expertise TEXT[] NOT NULL DEFAULT '{}',
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;

-- Self-only læsning/oprettelse/redigering — ingen DELETE-policy for
-- medlemmer (bevidst udeladt).
CREATE POLICY "Users can view their own member profile"
  ON public.member_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own member profile"
  ON public.member_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own member profile"
  ON public.member_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Advisors can view all member profiles"
  ON public.member_profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage member profiles"
  ON public.member_profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER set_member_profiles_updated_at
  BEFORE UPDATE ON public.member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RPC 1: get_member_profile — én brugers fulde visningsprofil ──
-- is_advisor via has_role (advisor ELLER admin pga. arven). Advisors står
-- ikke i company_members, så deres company-kolonner bliver NULL.

CREATE OR REPLACE FUNCTION public.get_member_profile(p_user_id uuid)
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
  FROM public.profiles p
  LEFT JOIN public.companies c ON c.id = public.user_company_id(p.user_id)
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE p.user_id = p_user_id
$$;

REVOKE ALL ON FUNCTION public.get_member_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_member_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_member_profile(uuid) TO authenticated;

-- ── RPC 2: get_event_participants — aktive tilmeldinger på et event ──
-- Samme kolonnesæt som get_member_profile; registered_at/cancelled_at
-- eksponeres ALDRIG. is_advisor med, da rådgivere kan tilmelde sig
-- deres egne events.

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
  ORDER BY p.full_name
$$;

REVOKE ALL ON FUNCTION public.get_event_participants(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_participants(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_participants(uuid) TO authenticated;

-- ── RPC 3: get_member_directory — medlemmer OG rådgivere ──
-- Rådgivere SKAL med i netværket (Jonas' beslutning 2026-08-10), men de
-- står ikke i company_members (handle_new_users advisor-gren indsætter kun
-- profiles + user_roles) — derfor UNION:
--   gren A: virksomhedsmedlemmer via company_members, is_advisor = false
--     (has_role udelader advisors OG admins pga. arven)
--   gren B: rådgivere via user_roles (advisor/admin-mønstret fra
--     get_all_advisor_profiles); company-kolonnerne er NULL for dem
-- UNION (ikke UNION ALL) deduplikerer på tværs — dækker både brugere med
-- flere company_members-rækker (company-kolonnerne er ens pr. bruger via
-- user_company_id) og rådgivere med både advisor- og admin-række.
-- Sortering: advisors sidst (false < true), derefter full_name.

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

REVOKE ALL ON FUNCTION public.get_member_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_member_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_member_directory() TO authenticated;
