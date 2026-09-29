-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- COMMUNITY_JSON_TIL_TEKST LÆRER RABATHENVISNING AT KENDE (29/9-2026, opfølgning
-- på «#» i chatten, trin 3). Motoren (communityDokument.ts) og chattens
-- tekstudledning (chatDokument.ts: chatDokumentTilTekst) kender allerede den
-- fjerde #-node, «rabathenvisning» (attrs aftaleId + titel); SQL'en gjorde ikke.
--
-- SENESTE DEFINITION: 20260917160000_community_tekst_med_opslaghenvisninger.sql
-- (ingen senere migration rører funktionen — målt med grep i supabase/migrations
-- 29/9). Funktionen genskabes ORDRET derfra; ændringen er ÉN række i
-- opslagslisten regler(nodetype, attribut, præfiks):
--   ('rabathenvisning',  'titel', '#')
-- — samme regel som de tre andre #-noder (tom titel → noden bidrager med intet),
-- og som chatDokumentTilTekst. COMMENT'en nævner den nye node. Intet andet:
-- ingen kolonner, policies, triggere eller grants.
--
-- HVAD DER SKER UDEN DENNE MIGRATION: Community's composer tilbyder ikke
-- rabataftaler, så et opslag med noden kommer kun fra en håndlavet klient — dér
-- falder noden i ELSE-grenen (node->>'text' = NULL): «#aftalen» mangler i
-- feedets uddrag, og et opslag, der KUN består af den, afvises som tomt.
-- Chatten rører ikke funktionen (chattens content udledes i TS).
--
-- EFTERPRØVET 29/9 (før kl. 14:13) som RÅ SELECT via MCP mod boardroom-2-prod
-- (tmhjionsbtgrwuzwjbgb — IKKE Lovable-prod): CTE'en med den gamle og den nye
-- opslagsliste som VALUES, ingen CREATE/ALTER/INSERT/UPDATE/DELETE. Svarene er
-- dem, der står under FACIT nedenfor. Lovable-prod er IKKE målt.
--
-- FØR OG EFTER — samme forespørgsel, ÉT resultatsæt (Lovables editor eksporterer
-- kun det sidste resultatsæt):
--   SELECT 'fire noder' AS sektion, public.community_json_til_tekst('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Se "},{"type":"henvisning","attrs":{"area":"academy","slug":"budget","titel":"Budget"}},{"type":"text","text":" og "},{"type":"eventhenvisning","attrs":{"eventId":"3f2504e0-4f89-41d3-9a0c-0305e82c3301","titel":"Vækstdag"}},{"type":"text","text":" og "},{"type":"opslaghenvisning","attrs":{"traadId":"9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d","titel":"Hej, jeg er Mette"}},{"type":"text","text":" og "},{"type":"rabathenvisning","attrs":{"aftaleId":"1b4e28ba-2fa1-41d2-883f-0016d3cca427","titel":"Dinero"}}]}]}'::jsonb) AS svar
--   UNION ALL
--   SELECT 'kun rabathenvisning', public.community_json_til_tekst('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"rabathenvisning","attrs":{"aftaleId":"1b4e28ba-2fa1-41d2-883f-0016d3cca427","titel":"Dinero"}}]}]}'::jsonb)
--   UNION ALL
--   SELECT 'rabathenvisning uden titel', public.community_json_til_tekst('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"rabathenvisning","attrs":{"aftaleId":"1b4e28ba-2fa1-41d2-883f-0016d3cca427"}}]}]}'::jsonb)
--   UNION ALL
--   SELECT 'definitionen kender rabathenvisning', (pg_get_functiondef('public.community_json_til_tekst(jsonb)'::regprocedure) LIKE '%rabathenvisning%')::text;
--
-- FACIT FØR (4 rækker):
--   fire noder                          | Se  #Budget  og  #Vækstdag  og  #Hej, jeg er Mette  og
--   kun rabathenvisning                 | NULL
--   rabathenvisning uden titel          | NULL
--   definitionen kender rabathenvisning | false
-- FACIT EFTER (4 rækker):
--   fire noder                          | Se  #Budget  og  #Vækstdag  og  #Hej, jeg er Mette  og  #Dinero
--   kun rabathenvisning                 | #Dinero
--   rabathenvisning uden titel          | NULL
--   definitionen kender rabathenvisning | true
-- (Dobbelte mellemrum: text-noderne bærer selv deres mellemrum, og string_agg
-- sætter ét imellem — som i dag. Prøven src/lib/__tests__/communityTekstRabat.test.ts
-- beviser, at chatDokumentTilTekst giver EFTER-teksten på «fire noder».)
--
-- ROLLBACK — den gamle definition ORDRET (20260917160000), kør uden «-- »:
-- CREATE OR REPLACE FUNCTION public.community_json_til_tekst(p_doc jsonb)
-- RETURNS text
-- LANGUAGE sql
-- IMMUTABLE
-- SET search_path TO 'public'
-- AS $$
--   WITH RECURSIVE noder(node, sti) AS (
--     -- Roden: selve dokumentet, tom sti.
--     SELECT p_doc, ARRAY[]::int[]
--     UNION ALL
--     -- Børnene: kun det eksplicitte "content"-array — marks og andre
--     -- felter besøges aldrig, og ingen node besøges to gange. (attrs
--     -- læses NEDENFOR for noder i opslagslisten, men gennemløbes ikke.)
--     SELECT barn.value, noder.sti || barn.ordinality::int
--     FROM noder
--     CROSS JOIN LATERAL jsonb_array_elements(noder.node->'content')
--       WITH ORDINALITY AS barn(value, ordinality)
--     WHERE jsonb_typeof(noder.node->'content') = 'array'
--   ),
--   -- Opslagslisten: (nodetype, attribut, præfiks). En ny nodetype med
--   -- tekst i attrs er én række her — ingen ny gren.
--   regler(nodetype, attribut, praefiks) AS (
--     VALUES
--       ('naevnelse',        'navn',  '@'),
--       ('henvisning',       'titel', '#'),
--       ('eventhenvisning',  'titel', '#'),
--       ('opslaghenvisning', 'titel', '#')
--   ),
--   vaerdier AS (
--     SELECT
--       -- '@' og '#' tages med, fordi uddraget skal læses som det
--       -- opslaget siger — ikke som et navn eller en titel uden markering.
--       -- Tom attribut → NULL → noden bidrager med intet (som før).
--       CASE
--         WHEN regler.nodetype IS NOT NULL
--              AND COALESCE(noder.node->'attrs'->>regler.attribut, '') <> ''
--           THEN regler.praefiks || (noder.node->'attrs'->>regler.attribut)
--         WHEN regler.nodetype IS NOT NULL
--           THEN NULL
--         ELSE noder.node->>'text'
--       END AS vaerdi,
--       noder.sti
--     FROM noder
--     LEFT JOIN regler ON regler.nodetype = noder.node->>'type'
--   )
--   SELECT btrim(string_agg(vaerdi, ' ' ORDER BY sti))
--   FROM vaerdier
--   WHERE COALESCE(vaerdi, '') <> ''
-- $$;
--
-- COMMENT ON FUNCTION public.community_json_til_tekst(jsonb) IS
--   'Udleder læsbar ren tekst af et Tiptap-dokument med en rekursiv CTE, der går eksplicit ned ad "content"-arrayerne: hver node besøges præcis én gang, så hver tekst optræder præcis én gang, i dokumentorden (sti af array-indekser), adskilt med ét mellemrum og btrim''et. Noder i opslagslisten regler(nodetype, attribut, præfiks) bidrager med præfiks + attrs.<attribut>: naevnelse → ''@'' + navn; henvisning, eventhenvisning og opslaghenvisning → ''#'' + titel — så navne og titler står i uddraget, og et opslag der kun består af en nævnelse eller henvisning ikke dømmes tomt. NULL ind giver NULL ud; et dokument uden (ikke-tomme) tekst- eller liste-noder giver NULL, så skrive-RPC''ernes tomhedstjek fortsat fanger det. Vilkårlig nesting understøttes. En ny nodetype med tekst i attrs er ÉN række i VALUES-listen (20260917160000).';

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
      ('opslaghenvisning', 'titel', '#'),
      ('rabathenvisning',  'titel', '#')
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
  'Udleder læsbar ren tekst af et Tiptap-dokument med en rekursiv CTE, der går eksplicit ned ad "content"-arrayerne: hver node besøges præcis én gang, så hver tekst optræder præcis én gang, i dokumentorden (sti af array-indekser), adskilt med ét mellemrum og btrim''et. Noder i opslagslisten regler(nodetype, attribut, præfiks) bidrager med præfiks + attrs.<attribut>: naevnelse → ''@'' + navn; henvisning, eventhenvisning, opslaghenvisning og rabathenvisning → ''#'' + titel — så navne og titler står i uddraget, og et opslag der kun består af en nævnelse eller henvisning ikke dømmes tomt. NULL ind giver NULL ud; et dokument uden (ikke-tomme) tekst- eller liste-noder giver NULL, så skrive-RPC''ernes tomhedstjek fortsat fanger det. Vilkårlig nesting understøttes. En ny nodetype med tekst i attrs er ÉN række i VALUES-listen (20260917160000; rabathenvisning 20260929180000).';
