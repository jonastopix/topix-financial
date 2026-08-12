-- Community: rådgivere kan SE skjult indhold — moderation kan fortrydes.
--
-- Skjul er i dag en envejsdør: skjul_community_traad kan sætte status til
-- 'skjult' og tilbage til 'aktiv', men læse-RPC'erne filtrerer på
-- status = 'aktiv' OGSÅ for rådgivere — så en skjult tråd forsvinder fra
-- enhver flade, også rådgiverens egen, og kan kun vises igen via
-- SQL-editoren. Derfor blev skjul-knappen bevidst holdt ude af fladen
-- (CommunityTraadView, PR #318). Denne migration giver rådgivere adgang
-- til at SE skjult indhold, så moderationen kan fortrydes.
--
-- Reglen i alle tre RPC'er: rådgivere ser 'aktiv' OG 'skjult'; medlemmer
-- ser fortsat KUN 'aktiv'. 'slettet' vises ALDRIG for nogen: et medlems
-- sletning er endelig og må ikke kunne ses eller fortrydes af en
-- rådgiver — kun skjul er moderation.
--
-- KUN kropp-ændringer: status-kolonnen står allerede i alle tre RETURNS
-- TABLE (20260812090000:42/125/203), så kolonnesættet er uændret, og
-- CREATE OR REPLACE rækker — ingen DROP, grants bevares. Sorteringen i
-- feedet og adgangstjekket først i kroppen er uændrede.
--
-- Ingen ændring af tabeller, policies, triggere, indekser eller
-- skrive-RPC'erne.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT pg_get_functiondef('public.get_community_feed(int, int)'::regprocedure);
--   SELECT pg_get_functiondef('public.get_community_traad(uuid)'::regprocedure);
--   SELECT pg_get_functiondef('public.get_community_svar(uuid)'::regprocedure);
-- og funktionelt: som rådgiver returnerer feedet en skjult tråd; som
-- medlem gør det ikke; en slettet tråd returneres for ingen.

-- ─────────────────────────────────────────────────────────────────────────
-- RPC 1: get_community_feed — rådgivere ser også skjulte tråde
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_community_feed(p_limit int DEFAULT 30, p_offset int DEFAULT 0)
RETURNS TABLE(
  id uuid,
  titel text,
  indhold text,
  indhold_json jsonb,
  status text,
  fastgjort boolean,
  antal_svar integer,
  antal_visninger integer,
  sidste_svar_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  kilde_type text,
  kilde_item_id uuid,
  kilde_event_id uuid,
  forfatter_id uuid,
  forfatter_navn text,
  forfatter_avatar_url text,
  antal_reaktioner bigint,
  jeg_har_reageret boolean,
  seneste_aktivitet_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- SECURITY DEFINER omgår RLS — funktionen SKAL selv håndhæve adgangen.
  -- Uden dette tjek er den en åben dør uden om de netop strammede
  -- community-policies. Tomt resultat, ikke fejl: en udløben bruger skal
  -- se et tomt community, ikke en fejlskærm.
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.titel,
    t.indhold,
    t.indhold_json,
    t.status,
    t.fastgjort,
    t.antal_svar,
    t.antal_visninger,
    t.sidste_svar_at,
    t.created_at,
    t.updated_at,
    t.kilde_type,
    t.kilde_item_id,
    t.kilde_event_id,
    t.forfatter_id,
    p.full_name,
    p.avatar_url,
    (SELECT count(*) FROM public.community_reaktioner r WHERE r.traad_id = t.id),
    EXISTS (SELECT 1 FROM public.community_reaktioner r
            WHERE r.traad_id = t.id AND r.bruger_id = auth.uid()),
    COALESCE(t.sidste_svar_at, t.created_at)
  FROM public.community_traade t
  LEFT JOIN public.profiles p ON p.user_id = t.forfatter_id
  -- Rådgivere ser aktiv OG skjult; medlemmer kun aktiv. 'slettet' vises
  -- aldrig for nogen — et medlems sletning er endelig, kun skjul er
  -- moderation.
  WHERE (t.status = 'aktiv'
         OR (t.status = 'skjult' AND public.has_role(auth.uid(), 'advisor')))
  -- Nøjagtig den kanoniske sortering fra idx_community_traade_feed
  -- (20260811150000): fastgjorte øverst, derefter seneste aktivitet.
  ORDER BY t.fastgjort DESC, COALESCE(t.sidste_svar_at, t.created_at) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_community_feed(int, int) IS
  'Community-feedet: aktive tråde med forfatter (profiles joines i funktionen — medlemmer kan ikke læse andres profiler direkte), reaktionstal og "har jeg reageret". SECURITY DEFINER med eget fail-closed adgangstjek (har_aktivt_medlemskab eller advisor) — tomt resultat for alle andre. Rådgivere ser også SKJULTE tråde (moderation kan fortrydes); ''slettet'' vises aldrig for nogen. Sorteringen er den kanoniske fra idx_community_traade_feed. Det strukturerede Tiptap-dokument (indhold_json) følger med ved siden af tekstuddraget.';

-- ─────────────────────────────────────────────────────────────────────────
-- RPC 2: get_community_traad — samme regel for én tråd
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_community_traad(p_traad_id uuid)
RETURNS TABLE(
  id uuid,
  titel text,
  indhold text,
  indhold_json jsonb,
  status text,
  fastgjort boolean,
  antal_svar integer,
  antal_visninger integer,
  sidste_svar_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  kilde_type text,
  kilde_item_id uuid,
  kilde_event_id uuid,
  forfatter_id uuid,
  forfatter_navn text,
  forfatter_avatar_url text,
  antal_reaktioner bigint,
  jeg_har_reageret boolean,
  seneste_aktivitet_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Samme fail-closed adgangstjek som get_community_feed — SECURITY
  -- DEFINER uden eget tjek er en åben dør uden om policies.
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.titel,
    t.indhold,
    t.indhold_json,
    t.status,
    t.fastgjort,
    t.antal_svar,
    t.antal_visninger,
    t.sidste_svar_at,
    t.created_at,
    t.updated_at,
    t.kilde_type,
    t.kilde_item_id,
    t.kilde_event_id,
    t.forfatter_id,
    p.full_name,
    p.avatar_url,
    (SELECT count(*) FROM public.community_reaktioner r WHERE r.traad_id = t.id),
    EXISTS (SELECT 1 FROM public.community_reaktioner r
            WHERE r.traad_id = t.id AND r.bruger_id = auth.uid()),
    COALESCE(t.sidste_svar_at, t.created_at)
  FROM public.community_traade t
  LEFT JOIN public.profiles p ON p.user_id = t.forfatter_id
  WHERE t.id = p_traad_id
    -- Rådgivere ser aktiv OG skjult; 'slettet' aldrig for nogen.
    AND (t.status = 'aktiv'
         OR (t.status = 'skjult' AND public.has_role(auth.uid(), 'advisor')));
END;
$$;

COMMENT ON FUNCTION public.get_community_traad(uuid) IS
  'Én community-tråd i samme kolonnesæt som get_community_feed. SECURITY DEFINER med samme fail-closed adgangstjek — tomt resultat for brugere uden aktivt fuldt medlemskab (medmindre advisor). Rådgivere ser også SKJULTE tråde (moderation kan fortrydes); ''slettet'' vises aldrig for nogen. Det strukturerede Tiptap-dokument (indhold_json) følger med ved siden af tekstuddraget.';

-- ─────────────────────────────────────────────────────────────────────────
-- RPC 3: get_community_svar — samme regel pr. svar, uafhængigt af tråden
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_community_svar(p_traad_id uuid)
RETURNS TABLE(
  id uuid,
  traad_id uuid,
  indhold text,
  indhold_json jsonb,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  forfatter_id uuid,
  forfatter_navn text,
  forfatter_avatar_url text,
  antal_reaktioner bigint,
  jeg_har_reageret boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Samme fail-closed adgangstjek som get_community_feed — SECURITY
  -- DEFINER uden eget tjek er en åben dør uden om policies.
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.traad_id,
    s.indhold,
    s.indhold_json,
    s.status,
    s.created_at,
    s.updated_at,
    s.forfatter_id,
    p.full_name,
    p.avatar_url,
    (SELECT count(*) FROM public.community_reaktioner r WHERE r.svar_id = s.id),
    EXISTS (SELECT 1 FROM public.community_reaktioner r
            WHERE r.svar_id = s.id AND r.bruger_id = auth.uid())
  FROM public.community_svar s
  LEFT JOIN public.profiles p ON p.user_id = s.forfatter_id
  WHERE s.traad_id = p_traad_id
    -- Svarets EGEN status dømmes — uafhængigt af trådens status, så
    -- rådgiveren kan læse svarene i en skjult tråd (tråd-adgangen
    -- afgøres af get_community_traad). Rådgivere ser aktiv OG skjult;
    -- 'slettet' aldrig for nogen.
    AND (s.status = 'aktiv'
         OR (s.status = 'skjult' AND public.has_role(auth.uid(), 'advisor')))
  ORDER BY s.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_community_svar(uuid) IS
  'Aktive svar på en community-tråd, kronologisk (created_at ASC), med forfatter fra profiles og reaktionstal/"har jeg reageret" pr. svar. SECURITY DEFINER med samme fail-closed adgangstjek som get_community_feed — tomt resultat uden aktivt fuldt medlemskab (medmindre advisor). Rådgivere ser også SKJULTE svar, uafhængigt af trådens status (moderation kan fortrydes); ''slettet'' vises aldrig for nogen. Det strukturerede Tiptap-dokument (indhold_json) følger med ved siden af tekstuddraget.';
