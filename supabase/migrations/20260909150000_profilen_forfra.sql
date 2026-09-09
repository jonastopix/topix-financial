-- Migration: profilen forfra — faktalinjen (by, stiftelsesår) i visnings-RPC'erne,
-- og de tre felters nye betydning.
--
-- BESLUTTET af Jonas 9/9 («Hvad arbejder du med nu — det er et dumt
-- spørgsmål»):
--   FAKTALINJEN uden tal: navn · branche · by · stiftet · medlem siden.
--   «Vi skal IKKE vise tal mellem medlemmer, som de ikke selv har valgt at
--   skrive.» Ingen omsætning, ingen størrelse, ingen intervaller — derfor
--   IKKE annual_revenue, IKKE revenue_interval, IKKE facts.
--   TRE FELTER, kolonnerne beholdes, betydningen skifter:
--     «Det laver vi»               companies.description       (160 tegn)
--     «Det har jeg været igennem»  member_profiles.ask_me_about (300 tegn)
--     «Det leder jeg efter»        member_profiles.working_on   (200 tegn)
--
-- HVAD DER ÆNDRES HER:
--   1) De tre visnings-RPC'er får to nye kolonner sidst: city (companies.city,
--      CVR-berigelsen #567) og stiftet_aar (EXTRACT(year FROM
--      companies.start_date) — start_date ER CVR-stiftelsesdatoen,
--      parseCvrStiftelsesdato). Rådgivergrenen giver NULL som for de øvrige
--      virksomhedskolonner. Alle eksisterende filtre er bevaret ORDRET fra
--      den seneste definition af hver funktion:
--        get_member_profile      ← 20260810200000 (ufiltreret direkte opslag)
--        get_event_participants  ← 20260810210000 (attending, aktivt medlemskab, legat-gate)
--        get_member_directory    ← 20260902110000 (rolle, aktivt medlemskab, legat, vis_i_netvaerk)
--   2) working_on nulstilles: feltet skifter betydning fra «det arbejder jeg
--      med lige nu» til «det leder jeg efter», og en gammel «lige nu»-tekst
--      under den nye etiket ville være forkert. MÅLT 9/9 kl. 13:43: NUL af
--      25 medlemmer har en række i member_profiles — der er formentlig intet
--      at rydde; rådgivernes egne rækker er ikke målt (FØR-SELECT nedenfor).
--   3) Kolonnekommentarer følger den nye betydning.
--
-- RLS ÆNDRES IKKE: «Det laver vi» skriver til companies.description, og
-- policyen «Members can update own company» (20260224222456:51-53, USING
-- id = user_company_id(auth.uid())) dækker allerede alle kolonner — det er
-- den samme policy Settings' «Gem virksomhed» skriver navn, CVR og website
-- igennem. Kolonnen manglede en FLADE, ikke en rettighed.
--
-- ⚠️ CREATE OR REPLACE kan IKKE bruges: returtypen ændres, og Postgres
-- afviser det med «cannot change return type of existing function». Derfor
-- DROP + CREATE, og grants gen-tildeles eksplicit til sidst (DROP fjerner
-- dem) — mønstret fra 20260810200000.
--
-- DEPLOY: køres MANUELT i Lovable → SQL editor efter merge (migrationer
-- auto-deployer aldrig). Frontenden tåler at køre FØR migrationen (city og
-- stiftet_aar læses som null når kolonnerne mangler), så rækkefølgen er fri.
--
-- FØR-verifikation (hvad der ville blive nulstillet i punkt 2):
--   SELECT mp.user_id, p.full_name, left(mp.working_on, 60) AS working_on, mp.working_on_updated_at
--   FROM public.member_profiles mp JOIN public.profiles p ON p.user_id = mp.user_id
--   WHERE mp.working_on IS NOT NULL;
--
-- EFTER-verifikation:
--   SELECT pg_get_functiondef('public.get_member_directory()'::regprocedure);
--   SELECT city, stiftet_aar FROM public.get_member_directory() LIMIT 5;
--   SELECT count(*) FROM public.member_profiles WHERE working_on IS NOT NULL;  -- 0

-- ── 1) Kolonnekommentarer: den nye betydning ──

COMMENT ON COLUMN public.companies.description IS '"Det laver vi" — én sætning om hvad I sælger, og til hvem (160 tegn); vises først på kortet i Netværket. Skrives af medlemmet selv (Settings) siden 9/9';
COMMENT ON COLUMN public.member_profiles.ask_me_about IS '"Det har jeg været igennem" — det andre kan spørge om, fordi man har PRØVET det (300 tegn); profilens bærende felt. Hed "Det kan du spørge mig om" 10/8–9/9';
COMMENT ON COLUMN public.member_profiles.working_on IS '"Det leder jeg efter" — én ting man gerne vil høre fra en der har prøvet det (200 tegn). Hed "Det arbejder jeg med lige nu" 10/8–9/9';
COMMENT ON COLUMN public.member_profiles.working_on_updated_at IS 'Sættes af frontend når working_on ændres — vises ikke længere som «Lige nu · dato» (9/9)';

-- ── 2) working_on nulstilles (betydningsskift) ──

UPDATE public.member_profiles
SET working_on = NULL,
    working_on_updated_at = NULL
WHERE working_on IS NOT NULL;

-- ── 3) De tre visnings-RPC'er genskabes med city + stiftet_aar sidst ──

DROP FUNCTION public.get_member_profile(uuid);
DROP FUNCTION public.get_event_participants(uuid);
DROP FUNCTION public.get_member_directory();

-- RPC 1: get_member_profile — ufiltreret direkte opslag (ordret fra 20260810200000 + to kolonner)

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
  is_advisor boolean,
  city text,
  stiftet_aar integer
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
    public.has_role(p.user_id, 'advisor'),
    c.city,
    EXTRACT(year FROM c.start_date)::integer
  FROM public.profiles p
  LEFT JOIN public.companies c ON c.id = public.user_company_id(p.user_id)
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE p.user_id = p_user_id
$$;

-- RPC 2: get_event_participants — filtre ordret fra 20260810210000 + to kolonner

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
  is_advisor boolean,
  city text,
  stiftet_aar integer
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
    public.has_role(p.user_id, 'advisor'),
    c.city,
    EXTRACT(year FROM c.start_date)::integer
  FROM public.event_registrations er
  JOIN public.profiles p ON p.user_id = er.user_id
  LEFT JOIN public.companies c ON c.id = public.user_company_id(p.user_id)
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE er.event_id = p_event_id
    AND er.cancelled_at IS NULL
    AND er.response = 'attending'
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

-- RPC 3: get_member_directory — filtre + advisor-UNION ordret fra 20260902110000 + to kolonner

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
  is_advisor boolean,
  city text,
  stiftet_aar integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.user_id, p.full_name, p.avatar_url, c.name, c.industry_label,
    c.description, c.website, mp.linkedin_url,
    COALESCE(mp.expertise, '{}'::text[]), mp.ask_me_about, mp.working_on,
    mp.working_on_updated_at,
    (SELECT MIN(cm2.created_at) FROM public.company_members cm2 WHERE cm2.user_id = p.user_id),
    false AS is_advisor,
    c.city,
    EXTRACT(year FROM c.start_date)::integer
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
    -- Gaester: adgang ja, netvaerk nej (20260902110000). COALESCE fordi
    -- join'et er et LEFT JOIN — en bruger uden virksomhed skal fortsat med.
    AND COALESCE(c.vis_i_netvaerk, true)
  UNION
  SELECT
    p.user_id, p.full_name, p.avatar_url,
    NULL::text, NULL::text, NULL::text, NULL::text,
    mp.linkedin_url, COALESCE(mp.expertise, '{}'::text[]),
    mp.ask_me_about, mp.working_on, mp.working_on_updated_at,
    NULL::timestamptz, true AS is_advisor,
    NULL::text, NULL::integer
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE ur.role IN ('advisor'::app_role, 'admin'::app_role)
  ORDER BY is_advisor, full_name, user_id
$$;

-- ── Grants gen-tildeles (DROP fjernede dem) — mønstret fra 20260810200000 ──

REVOKE ALL ON FUNCTION public.get_member_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_member_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_member_profile(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_event_participants(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_participants(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_participants(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_member_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_member_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_member_directory() TO authenticated;
