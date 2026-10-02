-- FIXTURE, IKKE EN MIGRATION. Ordret kopi af de to læse-RPC'er
-- (get_community_feed, get_community_traad) fra
-- supabase/migrations/20261002242000_community_gaest_laeser.sql på grenen
-- feat/trigger-og-gaest (commit 153f6052), hentet 2/10-2026.
--
-- Hvorfor en kopi: communitySpoergsmaal.guard dømmer, at kroppene i
-- 20261002243000_community_spoergsmaal.sql er gæstens kroppe ord for ord
-- (+ markørlinjerne). Gæstens migration er ikke merget til main, når
-- spørgsmålsgrenen bygges, og CI's checkout har ikke den anden gren — en
-- `git show` ville fejle eller måle en anden tilstand. Når filen FINDES i
-- repoet, kræver værnet, at denne kopi er identisk med den (blok for blok),
-- og sammenligner med filen; så kan fixturen slettes og værnet pege på
-- migrationen alene.

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
  -- LÆSE-dommen (2/10-2026): kan_laese_community — gæsten læser med.
  IF NOT (public.kan_laese_community(auth.uid())
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
  -- LÆSE-dommen (2/10-2026): kan_laese_community — gæsten læser med.
  IF NOT (public.kan_laese_community(auth.uid())
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
