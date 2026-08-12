-- Community: community_json_til_tekst lærer henvisninger at kende.
--
-- Samme mangel som for nævnelser (20260812160000), nu for
-- #-henvisninger: community_json_til_tekst kender ikke nodetypen
-- 'henvisning', så titlen mangler i indhold-uddraget, og et opslag der
-- KUN består af en henvisning ville blive afvist af skrive-RPC'ernes
-- tomhedstjek.
--
-- ADVARSEL til den næste, der tilføjer en nodetype: det er anden gang
-- samme mangel opstår. HVER ny nodetype med tekst i attrs (nævnelser:
-- attrs.navn; henvisninger: attrs.titel) kræver en udvidelse af
-- CASE-udtrykket her — motoren og composeren er ikke nok. Tjek denne
-- funktion, FØR nodetypen rammer prod.
--
-- Den rekursive CTE og nævnelses-grenen fra 20260812160000 beholdes
-- ordret; KUN CASE-udtrykket i vaerdier-laget udvides med
-- henvisnings-grenen.
--
-- EFTERPRØVET mod Postgres 17.6 (2026-08-12, CTE'en kørt som rå query):
-- kun henvisning → '#Kom godt i gang'; henvisning + tekst → '#Kom godt
-- i gang er et godt sted at starte'; henvisning UDEN titel → NULL;
-- blandet dokument → 'Se #Vaekst-talken @Mette'; nævnelses- og
-- tekst-adfærden uændret ('@Morten Larsen' / 'Overskrift Afsnit').
--
-- Ingen ændring af skrive-RPC'erne — de kalder funktionen ved navn og
-- får rettelsen automatisk. Ingen ændring af kolonner, policies eller
-- triggere.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   -- kun henvisning → '#Kom godt i gang'
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"paragraph","content":[
--       {"type":"henvisning","attrs":{"area":"classroom","slug":"kom-godt-i-gang","titel":"Kom godt i gang"}}]}
--   ]}'::jsonb);
--   -- henvisning + tekst → '#Kom godt i gang er et godt sted at starte'
--   -- (text-noden UDEN ledende mellemrum — separatoren er allerede ét)
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"paragraph","content":[
--       {"type":"henvisning","attrs":{"area":"classroom","slug":"kom-godt-i-gang","titel":"Kom godt i gang"}},
--       {"type":"text","text":"er et godt sted at starte"}]}
--   ]}'::jsonb);
--   -- henvisning UDEN titel → NULL
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"paragraph","content":[
--       {"type":"henvisning","attrs":{"area":"classroom","slug":"kom-godt-i-gang"}}]}
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
      CASE
        WHEN node->>'type' = 'naevnelse'
             AND COALESCE(node->'attrs'->>'navn', '') <> ''
          THEN '@' || (node->'attrs'->>'navn')
        WHEN node->>'type' = 'henvisning'
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
  'Udleder læsbar ren tekst af et Tiptap-dokument med en rekursiv CTE, der går eksplicit ned ad "content"-arrayerne: hver node besøges præcis én gang, så hver tekst optræder præcis én gang, i dokumentorden (sti af array-indekser), adskilt med ét mellemrum og btrim''et. Nævnelses-noder (type = ''naevnelse'') bidrager med ''@'' + attrs.navn, og henvisnings-noder (type = ''henvisning'') med ''#'' + attrs.titel — så det nævnte navn og den henviste titel står i uddraget, og et opslag der kun består af en nævnelse eller henvisning ikke dømmes tomt. NULL ind giver NULL ud; et dokument uden (ikke-tomme) tekst-, nævnelses- eller henvisnings-noder giver NULL, så skrive-RPC''ernes tomhedstjek fortsat fanger det. Vilkårlig nesting understøttes. HUSK: hver ny nodetype med tekst i attrs kræver en udvidelse af CASE-udtrykket her.';
