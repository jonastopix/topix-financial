-- Community: community_json_til_tekst lærer eventhenvisninger at kende.
--
-- TREDJE gang samme mangel — præcis som advarslen i 20260812170000
-- forudsagde: community_json_til_tekst kender ikke nodetypen
-- 'eventhenvisning', så titlen mangler i indhold-uddraget, og et opslag
-- der KUN består af en event-henvisning ville blive afvist af
-- skrive-RPC'ernes tomhedstjek.
--
-- Mønstret er nu bevist tre gange (naevnelse → henvisning →
-- eventhenvisning). Overvej ved NÆSTE nodetype, om CASE-udtrykket skal
-- erstattes af en tabel- eller array-drevet opslagsliste over
-- (nodetype, attribut, præfiks), så en ny type kun kræver én række frem
-- for en ny gren. Det bygges IKKE nu — tre grene er stadig læsbare, og
-- en abstraktion på tre er for tidlig.
--
-- Den rekursive CTE og de to eksisterende grene fra 20260812170000
-- beholdes ordret; KUN CASE-udtrykket udvides med
-- eventhenvisnings-grenen.
--
-- EFTERPRØVET mod Postgres 17.6 (2026-08-12, CTE'en kørt som rå query):
-- kun eventhenvisning → '#Live sparring'; eventhenvisning UDEN titel →
-- NULL; nævnelses-, henvisnings- og tekst-adfærden uændret.
--
-- Ingen ændring af skrive-RPC'erne — de kalder funktionen ved navn og
-- får rettelsen automatisk. Ingen ændring af kolonner, policies eller
-- triggere.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   -- kun eventhenvisning → '#Live sparring'
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"paragraph","content":[
--       {"type":"eventhenvisning","attrs":{"eventId":"3f2504e0-4f89-11d3-9a0c-0305e82c3301","titel":"Live sparring"}}]}
--   ]}'::jsonb);
--   -- eventhenvisning UDEN titel → NULL
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"paragraph","content":[
--       {"type":"eventhenvisning","attrs":{"eventId":"3f2504e0-4f89-11d3-9a0c-0305e82c3301"}}]}
--   ]}'::jsonb);

CREATE OR REPLACE FUNCTION public.community_json_til_tekst(p_doc jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH RECURSIVE noder(node, sti) AS (
    -- Roden: selve dokumentet, tom sti.
    SELECT p_doc, ARRAY[]::int[]
    UNION ALL
    -- Børnene: kun det eksplicitte "content"-array — marks og andre
    -- felter besøges aldrig, og ingen node besøges to gange. (attrs
    -- læses NEDENFOR for nævnelses- og henvisnings-noder, men
    -- gennemløbes ikke.)
    SELECT barn.value, noder.sti || barn.ordinality::int
    FROM noder
    CROSS JOIN LATERAL jsonb_array_elements(noder.node->'content')
      WITH ORDINALITY AS barn(value, ordinality)
    WHERE jsonb_typeof(noder.node->'content') = 'array'
  ),
  vaerdier AS (
    SELECT
      -- '@' og '#' tages med, fordi uddraget skal læses som det
      -- opslaget siger — ikke som et navn eller en titel uden markering.
      --
      -- 'henvisning' og 'eventhenvisning' er identiske grene ud over
      -- nodetypen (samme attrs.titel, samme '#'). De holdes ADSKILT
      -- frem for at slås sammen med en IN-liste, fordi de to nodetyper
      -- kan udvikle sig forskelligt — et event kunne fx senere bidrage
      -- med sin dato.
      CASE
        WHEN node->>'type' = 'naevnelse'
             AND COALESCE(node->'attrs'->>'navn', '') <> ''
          THEN '@' || (node->'attrs'->>'navn')
        WHEN node->>'type' = 'henvisning'
             AND COALESCE(node->'attrs'->>'titel', '') <> ''
          THEN '#' || (node->'attrs'->>'titel')
        WHEN node->>'type' = 'eventhenvisning'
             AND COALESCE(node->'attrs'->>'titel', '') <> ''
          THEN '#' || (node->'attrs'->>'titel')
        ELSE node->>'text'
      END AS vaerdi,
      sti
    FROM noder
  )
  SELECT btrim(string_agg(vaerdi, ' ' ORDER BY sti))
  FROM vaerdier
  WHERE COALESCE(vaerdi, '') <> ''
$$;

COMMENT ON FUNCTION public.community_json_til_tekst(jsonb) IS
  'Udleder læsbar ren tekst af et Tiptap-dokument med en rekursiv CTE, der går eksplicit ned ad "content"-arrayerne: hver node besøges præcis én gang, så hver tekst optræder præcis én gang, i dokumentorden (sti af array-indekser), adskilt med ét mellemrum og btrim''et. Nævnelses-noder (type = ''naevnelse'') bidrager med ''@'' + attrs.navn, henvisnings-noder (type = ''henvisning'') og eventhenvisnings-noder (type = ''eventhenvisning'') med ''#'' + attrs.titel — så navne og titler står i uddraget, og et opslag der kun består af en nævnelse eller henvisning ikke dømmes tomt. NULL ind giver NULL ud; et dokument uden (ikke-tomme) tekst-, nævnelses- eller henvisnings-noder giver NULL, så skrive-RPC''ernes tomhedstjek fortsat fanger det. Vilkårlig nesting understøttes. HUSK: hver ny nodetype med tekst i attrs kræver en udvidelse af CASE-udtrykket her — og ved den NÆSTE bør en opslagsliste (nodetype, attribut, præfiks) overvejes i stedet for en fjerde gren.';
