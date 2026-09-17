-- Community: community_json_til_tekst lærer opslagshenvisninger at kende —
-- og CASE-udtrykket bliver til en opslagsliste.
--
-- FJERDE nodetype med tekst i attrs (naevnelse → henvisning →
-- eventhenvisning → opslaghenvisning). 20260812190000 sagde ordret: «ved
-- NÆSTE nodetype bør en opslagsliste (nodetype, attribut, præfiks)
-- overvejes i stedet for en fjerde gren». Det er nu — så de fire grene
-- bliver til fire RÆKKER i en VALUES-liste, og den femte nodetype er én
-- række, ikke en ny gren.
--
-- Adfærden for de tre eksisterende typer er UÆNDRET: samme attribut
-- (navn hhv. titel), samme præfiks ('@' hhv. '#'), samme tomheds-regel
-- (tom attribut → noden bidrager med intet). Den rekursive CTE er ordret
-- fra 20260812190000. text-noder bidrager som før med node->>'text'.
--
-- Hvad der sker uden denne migration: composeren indsætter allerede
-- 'opslaghenvisning'-noder (PR B), og opret_community_traad kalder denne
-- funktion for indhold-uddraget. En ukendt nodetype falder i ELSE-grenen
-- (node->>'text' = NULL) — opslaget gemmes, men #titlen mangler i feedets
-- uddrag og i opslagsmailen, og et opslag der KUN består af en
-- opslagshenvisning afvises af tomhedstjekket. Migrationen skal derfor
-- køres SAMMEN med udrulningen af PR B's frontend.
--
-- IKKE KØRT i prod ved skrivning (17/9). Efterprøvningen 17/9 ca. 08:50 var
-- en RÅ SELECT via MCP (CTE'en med jsonb-literaler som VALUES) mod Postgres
-- 17.6 — INGEN skrivning: ingen CREATE, ALTER, INSERT, UPDATE, DELETE eller
-- CREATE OR REPLACE. Chattens regel 17/9: vinduerne læser kun (SELECT via
-- MCP); alt der skriver, går gennem Jonas i Lovables SQL editor.
-- Resultaterne: kun opslaghenvisning →
-- '#Hej, jeg er Mette'; uden titel → NULL; de tre gamle typer + tekst →
-- 'Hej  @Mette  se  #Budget  og  #Vækstdag'; nævnelse uden navn + tekst →
-- 'efter'; to afsnit m. nestet liste → 'A B #C'; tomt dokument → NULL.
--
-- ROLLBACK: kør 20260812190000_community_tekst_med_eventhenvisninger.sql
-- igen (CREATE OR REPLACE med de tre CASE-grene). Ingen kolonner,
-- policies eller triggere røres her, så der er intet andet at rulle
-- tilbage.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   -- FØR (forventet i prod i dag): NULL — nodetypen er ukendt
--   -- EFTER: '#Hej, jeg er Mette'
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"paragraph","content":[
--       {"type":"opslaghenvisning","attrs":{"traadId":"3f2504e0-4f89-11d3-9a0c-0305e82c3301","titel":"Hej, jeg er Mette"}}]}
--   ]}'::jsonb);
--   -- opslaghenvisning UDEN titel → NULL (før og efter)
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"paragraph","content":[
--       {"type":"opslaghenvisning","attrs":{"traadId":"3f2504e0-4f89-11d3-9a0c-0305e82c3301"}}]}
--   ]}'::jsonb);
--   -- de tre gamle typer + tekst, uændret: 'Hej  @Mette  se  #Budget  og  #Vækstdag'
--   -- (dobbelte mellemrum fordi text-noderne selv ender/starter med mellemrum og
--   -- string_agg sætter ét imellem — PRÆCIS som 20260812190000 gør i dag)
--   SELECT public.community_json_til_tekst('{"type":"doc","content":[
--     {"type":"paragraph","content":[
--       {"type":"text","text":"Hej "},
--       {"type":"naevnelse","attrs":{"userId":"3f2504e0-4f89-11d3-9a0c-0305e82c3301","navn":"Mette"}},
--       {"type":"text","text":" se "},
--       {"type":"henvisning","attrs":{"area":"academy","slug":"budget","titel":"Budget"}},
--       {"type":"text","text":" og "},
--       {"type":"eventhenvisning","attrs":{"eventId":"3f2504e0-4f89-11d3-9a0c-0305e82c3301","titel":"Vækstdag"}}]}
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
    -- læses NEDENFOR for noder i opslagslisten, men gennemløbes ikke.)
    SELECT barn.value, noder.sti || barn.ordinality::int
    FROM noder
    CROSS JOIN LATERAL jsonb_array_elements(noder.node->'content')
      WITH ORDINALITY AS barn(value, ordinality)
    WHERE jsonb_typeof(noder.node->'content') = 'array'
  ),
  -- Opslagslisten: (nodetype, attribut, præfiks). En ny nodetype med
  -- tekst i attrs er én række her — ingen ny gren.
  regler(nodetype, attribut, praefiks) AS (
    VALUES
      ('naevnelse',        'navn',  '@'),
      ('henvisning',       'titel', '#'),
      ('eventhenvisning',  'titel', '#'),
      ('opslaghenvisning', 'titel', '#')
  ),
  vaerdier AS (
    SELECT
      -- '@' og '#' tages med, fordi uddraget skal læses som det
      -- opslaget siger — ikke som et navn eller en titel uden markering.
      -- Tom attribut → NULL → noden bidrager med intet (som før).
      CASE
        WHEN regler.nodetype IS NOT NULL
             AND COALESCE(noder.node->'attrs'->>regler.attribut, '') <> ''
          THEN regler.praefiks || (noder.node->'attrs'->>regler.attribut)
        WHEN regler.nodetype IS NOT NULL
          THEN NULL
        ELSE noder.node->>'text'
      END AS vaerdi,
      noder.sti
    FROM noder
    LEFT JOIN regler ON regler.nodetype = noder.node->>'type'
  )
  SELECT btrim(string_agg(vaerdi, ' ' ORDER BY sti))
  FROM vaerdier
  WHERE COALESCE(vaerdi, '') <> ''
$$;

COMMENT ON FUNCTION public.community_json_til_tekst(jsonb) IS
  'Udleder læsbar ren tekst af et Tiptap-dokument med en rekursiv CTE, der går eksplicit ned ad "content"-arrayerne: hver node besøges præcis én gang, så hver tekst optræder præcis én gang, i dokumentorden (sti af array-indekser), adskilt med ét mellemrum og btrim''et. Noder i opslagslisten regler(nodetype, attribut, præfiks) bidrager med præfiks + attrs.<attribut>: naevnelse → ''@'' + navn; henvisning, eventhenvisning og opslaghenvisning → ''#'' + titel — så navne og titler står i uddraget, og et opslag der kun består af en nævnelse eller henvisning ikke dømmes tomt. NULL ind giver NULL ud; et dokument uden (ikke-tomme) tekst- eller liste-noder giver NULL, så skrive-RPC''ernes tomhedstjek fortsat fanger det. Vilkårlig nesting understøttes. En ny nodetype med tekst i attrs er ÉN række i VALUES-listen (20260917160000).';
