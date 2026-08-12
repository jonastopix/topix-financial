-- Community: get_community_medlemmer — opslagslisten bag @-nævnelser.
--
-- @-nævnelser i community skal kunne slå medlemmer op. get_member_directory
-- kan IKKE bruges: den filtrerer med is_membership_active — den fail-open
-- dom bygget til medlemsoversigten — mens community bruger
-- har_aktivt_medlemskab, som er fail-closed. Pickeren ville altså kunne
-- vise et medlem, der ikke selv har adgang til community, og en nævnelse
-- af den person ville ende som en notifikation om et opslag, de ikke kan
-- åbne. Denne RPC bruger community-dommen, så listen matcher adgangen.
--
-- Ingen ændring af tabeller, policies, triggere eller andre funktioner.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT pg_get_functiondef('public.get_community_medlemmer()'::regprocedure);
-- og som et medlem med community-adgang (forventet: medlemmer + rådgivere,
-- sorteret efter navn, kalderen selv inkluderet):
--   SELECT * FROM public.get_community_medlemmer();

CREATE OR REPLACE FUNCTION public.get_community_medlemmer()
RETURNS TABLE(
  user_id uuid,
  navn text,
  avatar_url text,
  virksomhed text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- SECURITY DEFINER omgår RLS — funktionen håndhæver selv adgangen.
  -- Tomt resultat, ikke fejl: samme begrundelse som get_community_feed —
  -- en udløben bruger skal se et tomt community, ikke en fejlskærm.
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  -- Resultatsættet er "hvem kan nævnes" = hvem kan selv se community:
  -- alle med har_aktivt_medlemskab PLUS alle rådgivere. Kalderen selv er
  -- BEVIDST med — frafiltrering af én selv hører i klienten: man kan
  -- have grund til at se sig selv i en liste, og RPC'en skal svare på
  -- "hvem kan nævnes", ikke "hvem er ikke mig".
  --
  -- Kilden er profiles (én række pr. bruger, PK user_id), så resultatet
  -- er dublet-frit uden DISTINCT.
  --
  -- Virksomhedsnavnet vælges DETERMINISTISK for brugere med flere
  -- virksomheder: ældste medlemskab først, id som tie-break.
  -- user_company_id bruges bevidst IKKE — den har LIMIT 1 uden ORDER BY
  -- og vælger derfor vilkårligt (jf. noten på har_aktivt_medlemskab i
  -- SECURITY_BASELINE).
  RETURN QUERY
  SELECT
    p.user_id,
    p.full_name,
    p.avatar_url,
    (SELECT c.name
     FROM public.company_members cm2
     JOIN public.companies c ON c.id = cm2.company_id
     WHERE cm2.user_id = p.user_id
     ORDER BY cm2.created_at, c.id
     LIMIT 1)
  FROM public.profiles p
  WHERE (
      EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.user_id)
      AND public.har_aktivt_medlemskab(p.user_id)
    )
    OR public.has_role(p.user_id, 'advisor')
  ORDER BY p.full_name, p.user_id;
END;
$$;

COMMENT ON FUNCTION public.get_community_medlemmer() IS
  'Opslagslisten bag @-nævnelser i community: alle brugere med har_aktivt_medlemskab plus alle rådgivere — netop dem, der selv kan se community. MÅ IKKE FORVEKSLES med get_member_directory, som bruger den fail-open is_membership_active (bygget til medlemsoversigten): denne funktion bruger community-dommen (fail-closed), så pickeren aldrig viser nogen, der ikke kan åbne det opslag, de nævnes i. Fail-closed adgangstjek først (tomt resultat, ikke fejl); kalderen selv er med; virksomhedsnavn vælges deterministisk (ældste medlemskab); sorteret efter navn.';

REVOKE ALL ON FUNCTION public.get_community_medlemmer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_medlemmer() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_community_medlemmer() TO authenticated;
