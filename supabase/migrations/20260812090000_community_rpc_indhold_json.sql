-- Community: læse-RPC'erne udvides med indhold_json.
--
-- Fladen renderer nu strukturerede dokumenter med CommunityDokument, men
-- læse-RPC'erne returnerer ikke indhold_json — så fallback'en til indhold
-- slår til, og medlemmet ville se sin egen formatering forsvinde straks
-- efter afsendelse. indhold er det mellemrums-sammensatte uddrag, ikke
-- formateret tekst. Denne migration tilføjer kolonnen til alle tre
-- læse-RPC'er.
--
-- En ændring af RETURNS TABLE kræver DROP først — Postgres tillader ikke
-- CREATE OR REPLACE når returtypen ændres ("cannot change return type of
-- existing function"). Hver funktion droppes derfor med sin fulde signatur
-- før CREATE. DROP fjerner også funktionens grants, så REVOKE/GRANT
-- gentages bagefter.
--
-- Alt andet er uændret og kopieret ordret fra 20260811170000_community_rpc:
-- adgangstjekket først i kroppen, sorteringen i feedet, status = 'aktiv'-
-- filtreringen, LEFT JOIN på profiles, reaktionstællingen, COALESCE-
-- udtrykket, LIMIT/OFFSET.
--
-- Ingen ændring af tabeller, policies, triggere, indekser eller
-- skrive-RPC'erne.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT pg_get_functiondef('public.get_community_feed(int, int)'::regprocedure);
--   SELECT pg_get_functiondef('public.get_community_traad(uuid)'::regprocedure);
--   SELECT pg_get_functiondef('public.get_community_svar(uuid)'::regprocedure);

-- ─────────────────────────────────────────────────────────────────────────
-- RPC 1: get_community_feed — nu med indhold_json efter indhold
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION public.get_community_feed(int, int);

CREATE FUNCTION public.get_community_feed(p_limit int DEFAULT 30, p_offset int DEFAULT 0)
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
  WHERE t.status = 'aktiv'
  -- Nøjagtig den kanoniske sortering fra idx_community_traade_feed
  -- (20260811150000): fastgjorte øverst, derefter seneste aktivitet.
  ORDER BY t.fastgjort DESC, COALESCE(t.sidste_svar_at, t.created_at) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_community_feed(int, int) IS
  'Community-feedet: aktive tråde med forfatter (profiles joines i funktionen — medlemmer kan ikke læse andres profiler direkte), reaktionstal og "har jeg reageret". SECURITY DEFINER med eget fail-closed adgangstjek (har_aktivt_medlemskab eller advisor) — tomt resultat for alle andre. Sorteringen er den kanoniske fra idx_community_traade_feed. Det strukturerede Tiptap-dokument (indhold_json) følger nu med ved siden af tekstuddraget.';

REVOKE ALL ON FUNCTION public.get_community_feed(int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_feed(int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_community_feed(int, int) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- RPC 2: get_community_traad — nu med indhold_json efter indhold
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION public.get_community_traad(uuid);

CREATE FUNCTION public.get_community_traad(p_traad_id uuid)
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
    AND t.status = 'aktiv';
END;
$$;

COMMENT ON FUNCTION public.get_community_traad(uuid) IS
  'Én community-tråd i samme kolonnesæt som get_community_feed. SECURITY DEFINER med samme fail-closed adgangstjek — tomt resultat for brugere uden aktivt fuldt medlemskab (medmindre advisor). Kun status = ''aktiv''. Det strukturerede Tiptap-dokument (indhold_json) følger nu med ved siden af tekstuddraget.';

REVOKE ALL ON FUNCTION public.get_community_traad(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_traad(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_community_traad(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- RPC 3: get_community_svar — nu med indhold_json efter indhold
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION public.get_community_svar(uuid);

CREATE FUNCTION public.get_community_svar(p_traad_id uuid)
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
    AND s.status = 'aktiv'
  ORDER BY s.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_community_svar(uuid) IS
  'Aktive svar på en community-tråd, kronologisk (created_at ASC), med forfatter fra profiles og reaktionstal/"har jeg reageret" pr. svar. SECURITY DEFINER med samme fail-closed adgangstjek som get_community_feed — tomt resultat uden aktivt fuldt medlemskab (medmindre advisor). Det strukturerede Tiptap-dokument (indhold_json) følger nu med ved siden af tekstuddraget.';

REVOKE ALL ON FUNCTION public.get_community_svar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_svar(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_community_svar(uuid) TO authenticated;
