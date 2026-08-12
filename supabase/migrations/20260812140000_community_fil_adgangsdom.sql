-- Community-filer: adgangsdommen bag signeringen.
--
-- Samme model som billed-dommen (20260812110000), men for fil-noder i
-- community-filer-bucketen. Kan ikke genbruge maa_se_community_billede:
-- den leder efter noder med type = "image", og en vedhæftet fil er en
-- anden nodetype. Uden et adgangstjek kunne et medlem få signeret enhver
-- fil i bucketen ved at gætte stier — service-role omgår al RLS. Denne
-- funktion er dommen: findes stien i et community-dokument, som kalderen
-- må se? Den er fail-closed og bruges af edge-funktionen FØR signering.
--
-- Nodetypen hedder "fil", ikke "file": alt i community-laget er dansk
-- (tabeller, kolonner, funktioner), og nodetypen er vores egen — ikke en
-- Tiptap-standardnode.
--
-- Ingen ændring af tabeller, policies, triggere eller andre funktioner.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT pg_get_functiondef('public.maa_se_community_fil(uuid, text)'::regprocedure);
-- og mod et rigtigt dokument (forventet true for et medlem med adgang,
-- efter at en aktiv tråd har en fil-node med attrs.path = stien):
--   SELECT public.maa_se_community_fil('<uid>', '<uid>/123-rapport.pdf');

CREATE OR REPLACE FUNCTION public.maa_se_community_fil(_user_id uuid, _sti text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Fail-closed hele vejen: NULL-input eller tom sti er aldrig et ja.
  IF _user_id IS NULL OR _sti IS NULL OR btrim(_sti) = '' THEN
    RETURN false;
  END IF;

  -- 1) Har brugeren adgang til community overhovedet? Samme dom som
  -- læse-RPC'erne (har_aktivt_medlemskab eller advisor) — nej → false.
  IF NOT (public.har_aktivt_medlemskab(_user_id)
          OR public.has_role(_user_id, 'advisor')) THEN
    RETURN false;
  END IF;

  -- 2) Optræder stien som fil-node i et AKTIVT dokument? Kun status =
  -- 'aktiv' tæller: skjules en tråd (eller et svar), skal dens filer
  -- ikke længere kunne signeres — dommen følger synligheden, ikke
  -- historikken.
  --
  -- Om '$.**': wildcardet matcher på ALLE niveauer og kan ramme samme
  -- node ad flere stier — det var dublet-fælden i tekstudledningen
  -- (20260811200000). Her spørges der kun jsonb_path_exists (findes der
  -- MINDST én match?), så dubletter er harmløse. Uparsbare/skæve
  -- dokumenter kaster ikke i lax mode (default) — noder uden attrs
  -- matcher bare ikke; NULL-dokumenter frasorteres eksplicit.
  --
  -- Formen '$.**?(...)' skrives UDEN mellemrum mellem wildcard og filter:
  -- det er den entydige form (mellemrummet parser ikke i alle Postgres-
  -- versioners jsonpath-parser, jf. 20260812110000).
  RETURN EXISTS (
    SELECT 1
    FROM public.community_traade t
    WHERE t.status = 'aktiv'
      AND t.indhold_json IS NOT NULL
      AND jsonb_path_exists(
            t.indhold_json,
            '$.**?(@.type == "fil" && @.attrs.path == $sti)',
            jsonb_build_object('sti', _sti)
          )
  ) OR EXISTS (
    SELECT 1
    FROM public.community_svar s
    WHERE s.status = 'aktiv'
      AND s.indhold_json IS NOT NULL
      AND jsonb_path_exists(
            s.indhold_json,
            '$.**?(@.type == "fil" && @.attrs.path == $sti)',
            jsonb_build_object('sti', _sti)
          )
  );
END;
$$;

COMMENT ON FUNCTION public.maa_se_community_fil(uuid, text) IS
  'Edge-funktionens PORT før signering af community-filer — ikke en RLS-policy. Svarer på: må denne bruger hente filen på denne sti? Fail-closed: false ved NULL/tom sti, uden community-adgang (har_aktivt_medlemskab eller advisor), og når stien ikke optræder som fil-node (type = ''fil'', attrs.path) i indhold_json på en AKTIV tråd eller et AKTIVT svar. Skjules indholdet, følger filadgangen med.';

-- Grants. BEMÆRK: service_role arver IKKE authenticated-grants — det
-- kostede en fejlsøgning 10. august med get_member_directory (cron kunne
-- ikke kalde den). Edge-funktionen kalder med service-role, så begge
-- grants er nødvendige.
REVOKE ALL ON FUNCTION public.maa_se_community_fil(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maa_se_community_fil(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.maa_se_community_fil(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maa_se_community_fil(uuid, text) TO service_role;
