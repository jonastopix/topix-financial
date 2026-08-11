-- Community: community_json_til_tekst rettes — jsonpath dublerede teksten.
--
-- FEJLEN: community_json_til_tekst brugte jsonpath '$.**.text' og
-- returnerede hver tekst TO GANGE. Bevist i produktion 11. august: et
-- Tiptap-dokument med overskrift, afsnit og punktopstilling gav
-- "Vi mistede vores største kunde Vi mistede vores største kunde Her er
-- hvad jeg gjorde. Tre ting. Her er hvad jeg gjorde. Tre ting. Ringede
-- til alle. Ringede til alle."
-- Årsagen er, at '**' matcher på alle niveauer og rammer både tekst-noden
-- og de containere, søgningen passerer igennem. Kommentaren i den
-- oprindelige migration påstod, at jsonpath var det robuste valg — den
-- påstand var forkert og blev ikke efterprøvet mod et rigtigt dokument.
--
-- RETTELSEN: rekursiv CTE, der går ned ad "content"-arrayet EKSPLICIT og
-- kun læser text-feltet på de noder, den besøger — hver node besøges
-- præcis én gang, så hver tekst optræder præcis én gang. Dokumentorden
-- bevares via en sti af array-indekser (ORDER BY sti: forældre-/søskende-
-- rækkefølgen er den leksikografiske sti-orden). Skrive-RPC'erne kalder
-- funktionen ved navn og får rettelsen automatisk.
--
-- EFTERPRØVET (modsat den oprindelige påstand): CTE'en er kørt mod
-- Postgres 17 med prod-fejlens dokument (hver tekst præcis én gang, i
-- dokumentorden) samt kanterne NULL-ind, tomt dokument, kun tomme afsnit
-- (alle → NULL) og dyb nesting (afsnit i listeelement i punktopstilling
-- i listeelement) — 2026-08-11.
--
-- Ingen ændring af skrive-RPC'erne, kolonner, policies, triggere eller
-- indekser.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med (skal give 'Overskrift Afsnit Punkt' — hver
-- tekst præcis én gang):
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"heading","content":[{"type":"text","text":"Overskrift"}]},
--     {"type":"paragraph","content":[{"type":"text","text":"Afsnit"}]},
--     {"type":"bulletList","content":[{"type":"listItem","content":[
--       {"type":"paragraph","content":[{"type":"text","text":"Punkt"}]}]}]}
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
    -- Børnene: kun det eksplicitte "content"-array — marks, attrs og
    -- andre felter besøges aldrig, og ingen node besøges to gange.
    SELECT barn.value, noder.sti || barn.ordinality::int
    FROM noder
    CROSS JOIN LATERAL jsonb_array_elements(noder.node->'content')
      WITH ORDINALITY AS barn(value, ordinality)
    WHERE jsonb_typeof(noder.node->'content') = 'array'
  )
  SELECT btrim(string_agg(node->>'text', ' ' ORDER BY sti))
  FROM noder
  WHERE COALESCE(node->>'text', '') <> ''
$$;

COMMENT ON FUNCTION public.community_json_til_tekst(jsonb) IS
  'Udleder læsbar ren tekst af et Tiptap-dokument med en rekursiv CTE, der går eksplicit ned ad "content"-arrayerne: hver node besøges præcis én gang, så hver tekst optræder præcis én gang, i dokumentorden (sti af array-indekser), adskilt med ét mellemrum og btrim''et. NULL ind giver NULL ud; et dokument uden (ikke-tomme) tekstnoder giver NULL, så skrive-RPC''ernes tomhedstjek fortsat fanger det. Vilkårlig nesting (afsnit i listeelementer i punktopstillinger) understøttes.';
