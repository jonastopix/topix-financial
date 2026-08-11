-- Community: struktureret JSON-indhold (Tiptap-dokumentformat).
--
-- Community-indhold gemmes som struktureret JSON (Tiptaps dokumentformat),
-- ikke som markup. Fladen renderer dokumentet med komponenter, vi selv ejer,
-- og der findes derfor aldrig brugerskrevet HTML i databasen — intet at
-- rense, og fuld kontrol over hvordan et citat, et billede eller en
-- overskrift ser ud. Tekstkolonnen indhold beholdes som et rent uddrag til
-- feedet og til senere søgning; den udledes af dokumentet i skrive-RPC'erne,
-- aldrig af klienten, så de to felter ikke kan komme i utakt.
--
-- Ingen ændring af policies, triggere, indekser eller læse-RPC'erne.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hej"},{"type":"text","text":"verden"}]}]}'::jsonb);  -- 'Hej verden'
--   SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
--   WHERE proname IN ('opret_community_traad', 'opret_community_svar');  -- præcis én række pr. navn

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 1: kolonner — rent additivt
-- ─────────────────────────────────────────────────────────────────────────

-- Nullable og uden default: eksisterende rækker (der er ingen) og
-- fremtidige kald uden dokument skal ikke fejle.
ALTER TABLE public.community_traade
  ADD COLUMN IF NOT EXISTS indhold_json jsonb;
ALTER TABLE public.community_svar
  ADD COLUMN IF NOT EXISTS indhold_json jsonb;

COMMENT ON COLUMN public.community_traade.indhold_json IS
  'Trådens indhold som struktureret Tiptap-dokument (JSON). NULL = oprettet uden dokument (ren tekst i indhold). Fladen renderer dokumentet med egne komponenter — der findes aldrig brugerskrevet HTML i databasen.';
COMMENT ON COLUMN public.community_svar.indhold_json IS
  'Svarets indhold som struktureret Tiptap-dokument (JSON). NULL = oprettet uden dokument (ren tekst i indhold). Fladen renderer dokumentet med egne komponenter — der findes aldrig brugerskrevet HTML i databasen.';

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 2: community_json_til_tekst — rent uddrag af dokumentet
-- ─────────────────────────────────────────────────────────────────────────

-- Valg: jsonpath ($.**.text via jsonb_path_query_array) frem for en
-- rekursiv CTE. Jsonpath-traversalen er deklarativ, besøger noderne i
-- dokumentorden (pre-order) og er robust over for vilkårlig nesting og
-- ukendte node-typer — en rekursiv CTE skal selv skelne arrays fra
-- objekter og er mere kode at fejle i. NULL ind giver NULL ud
-- (jsonb_array_elements er strict → nul rækker → string_agg → NULL).
CREATE OR REPLACE FUNCTION public.community_json_til_tekst(p_doc jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT btrim(string_agg(t.elem #>> '{}', ' '))
  FROM jsonb_array_elements(jsonb_path_query_array(p_doc, '$.**.text')) AS t(elem)
$$;

COMMENT ON FUNCTION public.community_json_til_tekst(jsonb) IS
  'Udleder læsbar ren tekst af et Tiptap-dokument: samler alle "text"-felter rekursivt i dokumentorden, adskilt med mellemrum, btrim''et. NULL ind giver NULL ud; et dokument uden tekstnoder giver ligeledes NULL. Bruges af skrive-RPC''erne til at holde indhold-kolonnen (feed-uddrag/søgning) i takt med indhold_json.';

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 3: skrive-RPC'erne udvides med p_indhold_json
-- ─────────────────────────────────────────────────────────────────────────
--
-- De GAMLE signaturer droppes eksplicit: en ny parameterliste gør CREATE
-- til en NY overload i stedet for en erstatning, og med begge versioner
-- stående ville et kald med de gamle argumenter ramme "function is not
-- unique" (den nye matcher også via DEFAULT). Efter drop findes præcis én
-- funktion pr. navn. Gamle kald med færre argumenter virker fortsat,
-- fordi p_indhold_json har DEFAULT NULL — derfor beholdes de gamle
-- signaturer IKKE.
DROP FUNCTION IF EXISTS public.opret_community_traad(text, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.opret_community_svar(uuid, text);

CREATE OR REPLACE FUNCTION public.opret_community_traad(
  p_titel text,
  p_indhold text,
  p_kilde_type text DEFAULT NULL,
  p_kilde_item_id uuid DEFAULT NULL,
  p_kilde_event_id uuid DEFAULT NULL,
  p_indhold_json jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _id uuid;
  _tekst text;
BEGIN
  -- SECURITY DEFINER omgår RLS — funktionen håndhæver selv adgangen.
  -- Skrivning rejser fejl (modsat læse-RPC'ernes tomme resultat): en
  -- handling, der ikke må ske, skal fejle synligt.
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RAISE EXCEPTION 'Ingen adgang til community';
  END IF;

  -- Whitespace alene er tomt.
  IF btrim(COALESCE(p_titel, '')) = '' THEN
    RAISE EXCEPTION 'Titlen må ikke være tom';
  END IF;

  -- Uden dette tjek kan et medlem gemme vilkårlig JSON i feltet — et
  -- array, et tal, et objekt uden struktur. Rendereren viser kun kendte
  -- noder, så det bider ikke på skærmen, men databasen skal ikke være et
  -- fribytterfelt. Et Tiptap-dokument har altid type = "doc" i roden;
  -- tjekket hører ved døren, ikke i klienten.
  IF p_indhold_json IS NOT NULL
     AND (jsonb_typeof(p_indhold_json) IS DISTINCT FROM 'object'
          OR p_indhold_json->>'type' IS DISTINCT FROM 'doc') THEN
    RAISE EXCEPTION 'Ugyldigt dokumentformat';
  END IF;

  -- Er dokumentet sat, udledes teksten af det og p_indhold ignoreres —
  -- klienten bestemmer aldrig uddraget, så indhold og indhold_json ikke
  -- kan komme i utakt. Tomhedstjekket gælder den tekst, der faktisk ender
  -- i indhold: et dokument med kun tomme afsnit afvises.
  _tekst := CASE
    WHEN p_indhold_json IS NOT NULL THEN public.community_json_til_tekst(p_indhold_json)
    ELSE btrim(p_indhold)
  END;
  IF btrim(COALESCE(_tekst, '')) = '' THEN
    RAISE EXCEPTION 'Indholdet må ikke være tomt';
  END IF;

  -- Kilde-felterne sendes videre som de er — CHECK-constrainten
  -- community_traade_kilde_check håndhæver sammenhængen.
  INSERT INTO public.community_traade
    (forfatter_id, titel, indhold, indhold_json, kilde_type, kilde_item_id, kilde_event_id)
  VALUES
    (auth.uid(), btrim(p_titel), _tekst, p_indhold_json, p_kilde_type, p_kilde_item_id, p_kilde_event_id)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

COMMENT ON FUNCTION public.opret_community_traad(text, text, text, uuid, uuid, jsonb) IS
  'Opretter en community-tråd som den kaldende bruger (forfatter_id = auth.uid()) og returnerer id. Fail-closed adgangstjek (har_aktivt_medlemskab eller advisor) — rejser fejl. Er p_indhold_json (Tiptap-dokument) sat, udledes indhold-teksten af dokumentet og p_indhold ignoreres; ellers gemmes btrim(p_indhold) og indhold_json forbliver NULL. Tomhedstjekket gælder den tekst der faktisk gemmes. Kilde-sammenhængen håndhæves af tabellens CHECK-constraint.';

REVOKE ALL ON FUNCTION public.opret_community_traad(text, text, text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.opret_community_traad(text, text, text, uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.opret_community_traad(text, text, text, uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.opret_community_svar(
  p_traad_id uuid,
  p_indhold text,
  p_indhold_json jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _id uuid;
  _tekst text;
BEGIN
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RAISE EXCEPTION 'Ingen adgang til community';
  END IF;

  -- Uden dette tjek kan et medlem gemme vilkårlig JSON i feltet — et
  -- array, et tal, et objekt uden struktur. Rendereren viser kun kendte
  -- noder, så det bider ikke på skærmen, men databasen skal ikke være et
  -- fribytterfelt. Et Tiptap-dokument har altid type = "doc" i roden;
  -- tjekket hører ved døren, ikke i klienten.
  IF p_indhold_json IS NOT NULL
     AND (jsonb_typeof(p_indhold_json) IS DISTINCT FROM 'object'
          OR p_indhold_json->>'type' IS DISTINCT FROM 'doc') THEN
    RAISE EXCEPTION 'Ugyldigt dokumentformat';
  END IF;

  -- Er dokumentet sat, udledes teksten af det og p_indhold ignoreres (se
  -- opret_community_traad). Tomhedstjekket gælder den tekst, der faktisk
  -- ender i indhold.
  _tekst := CASE
    WHEN p_indhold_json IS NOT NULL THEN public.community_json_til_tekst(p_indhold_json)
    ELSE btrim(p_indhold)
  END;
  IF btrim(COALESCE(_tekst, '')) = '' THEN
    RAISE EXCEPTION 'Indholdet må ikke være tomt';
  END IF;

  -- Tråden skal findes og være aktiv FØR insert: uden tjekket kan et svar
  -- skrives ind i en skjult tråd, som forfatteren ikke selv kan se.
  IF NOT EXISTS (
    SELECT 1 FROM public.community_traade t
    WHERE t.id = p_traad_id AND t.status = 'aktiv'
  ) THEN
    RAISE EXCEPTION 'Tråden findes ikke eller er lukket';
  END IF;

  INSERT INTO public.community_svar (traad_id, forfatter_id, indhold, indhold_json)
  VALUES (p_traad_id, auth.uid(), _tekst, p_indhold_json)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

COMMENT ON FUNCTION public.opret_community_svar(uuid, text, jsonb) IS
  'Opretter et svar som den kaldende bruger og returnerer id. Fail-closed adgangstjek der rejser fejl. Er p_indhold_json (Tiptap-dokument) sat, udledes indhold-teksten af dokumentet og p_indhold ignoreres; ellers gemmes btrim(p_indhold). Tomhedstjekket gælder den tekst der faktisk gemmes. Kræver at tråden findes med status = ''aktiv''. Trådens antal_svar/sidste_svar_at vedligeholdes af trigger.';

REVOKE ALL ON FUNCTION public.opret_community_svar(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.opret_community_svar(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.opret_community_svar(uuid, text, jsonb) TO authenticated;
