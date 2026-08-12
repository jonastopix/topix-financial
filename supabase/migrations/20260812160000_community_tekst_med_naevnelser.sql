-- Community: community_json_til_tekst lærer nævnelser at kende.
--
-- FEJLEN: community_json_til_tekst læser kun text-felter og aldrig attrs.
-- En nævnelses-node bidrager derfor med NUL tekst, og det har to
-- konsekvenser, begge bevist i produktion 12. august:
-- 1. Et opslag der KUN består af en nævnelse afvises af skrive-RPC'ernes
--    tomhedstjek — det indsatte mellemrum trimmes væk, og udledningen
--    giver tom streng.
-- 2. Det nævnte navn mangler i indhold-uddraget, så feedet viser en tekst
--    uden det navn, opslaget handler om.
-- Den tidligere "løsning" — at composeren indsætter et mellemrum ved
-- siden af nævnelsen — var utilstrækkelig og bliver overflødig med denne
-- rettelse. Rettelsen hører i udledningen, ikke i klienten.
--
-- Den rekursive CTE fra 20260811200000 beholdes uændret (eksplicit
-- content-gennemløb, efterprøvet — må ikke erstattes af jsonpath); KUN
-- opsamlingen udvides: en node med type = 'naevnelse' bidrager med '@'
-- foran sit navn fra attrs->>'navn'.
--
-- EFTERPRØVET mod Postgres 17.6 (2026-08-12, CTE'en kørt som rå query):
-- kun nævnelse → '@Morten Larsen'; nævnelse + tekst → '@Morten Larsen
-- kan du kigge paa det?'; tomt dokument → NULL; nævnelse UDEN navn →
-- NULL (fail-closed); almindelig tekst → 'Overskrift Afsnit' (uændret,
-- ingen dubletter).
--
-- Ingen ændring af skrive-RPC'erne — de kalder funktionen ved navn og
-- får rettelsen automatisk. Ingen ændring af kolonner, policies eller
-- triggere.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   -- kun nævnelse → '@Morten Larsen' (ikke NULL — opslaget kan gemmes)
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"paragraph","content":[
--       {"type":"naevnelse","attrs":{"userId":"3f2504e0-4f89-11d3-9a0c-0305e82c3301","navn":"Morten Larsen"}}]}
--   ]}'::jsonb);
--   -- nævnelse + tekst → '@Morten Larsen kan du kigge paa det?'
--   -- (bemærk: text-noden UDEN ledende mellemrum — separatoren mellem
--   -- noder er allerede ét mellemrum, og et ledende mellemrum i teksten
--   -- ville give to; interne mellemrum bevares som i 20260811200000)
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"paragraph","content":[
--       {"type":"naevnelse","attrs":{"userId":"3f2504e0-4f89-11d3-9a0c-0305e82c3301","navn":"Morten Larsen"}},
--       {"type":"text","text":"kan du kigge paa det?"}]}
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
    -- læses NEDENFOR for nævnelses-noder, men gennemløbes ikke.)
    SELECT barn.value, noder.sti || barn.ordinality::int
    FROM noder
    CROSS JOIN LATERAL jsonb_array_elements(noder.node->'content')
      WITH ORDINALITY AS barn(value, ordinality)
    WHERE jsonb_typeof(noder.node->'content') = 'array'
  ),
  vaerdier AS (
    SELECT
      -- '@' tages med, fordi uddraget skal læses som det opslaget siger
      -- — ikke som et navn uden markering.
      CASE
        WHEN node->>'type' = 'naevnelse'
             AND COALESCE(node->'attrs'->>'navn', '') <> ''
          THEN '@' || (node->'attrs'->>'navn')
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
  'Udleder læsbar ren tekst af et Tiptap-dokument med en rekursiv CTE, der går eksplicit ned ad "content"-arrayerne: hver node besøges præcis én gang, så hver tekst optræder præcis én gang, i dokumentorden (sti af array-indekser), adskilt med ét mellemrum og btrim''et. Nævnelses-noder (type = ''naevnelse'') bidrager med ''@'' + attrs.navn, så det nævnte navn står i uddraget, og et opslag der kun består af en nævnelse ikke dømmes tomt. NULL ind giver NULL ud; et dokument uden (ikke-tomme) tekst- eller nævnelses-noder giver NULL, så skrive-RPC''ernes tomhedstjek fortsat fanger det. Vilkårlig nesting understøttes.';
