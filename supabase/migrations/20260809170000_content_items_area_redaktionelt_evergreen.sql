-- Migration: content_items.area + 'redaktionelt' + 'evergreen'
-- Forside PR B1 (hb-forside-prb-recon §3/§6): to nye kuraterede areas
-- efter ugens_video-mønstret (20260809140000) — redaktionelle indslag
-- (blog/LinkedIn m. metadata.link/quote) og evergreen-biblioteket
-- (roterer deterministisk pr. ISO-uge, pickEvergreen-dommen).
--
-- KUN content_items udvides. content_collections' area-CHECK røres
-- BEVIDST ikke — ingen af de nye areas har samlinger. Typerne genbruges
-- (type-CHECK'en er uændret; DEFAULT_TYPE i ContentView sætter
-- 'push_indslag' for begge) — ingen type-ændring, ingen nye kolonner
-- (link/citat bor i metadata-jsonb; billede i cover_path).
--
-- DEPLOY: køres MANUELT i Lovable -> SQL editor EFTER merge og FØR
-- frontend-"Update" der bruger de nye areas (PostgREST-skema-cache;
-- PGRST204-lærdommen fra content_items_handout_module, 20260805120000).
--
-- FØR-query (verificér constraint-navnet):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.content_items'::regclass AND conname LIKE '%area%';
--
-- ROLLBACK (kør kun hvis ingen rækker bruger de nye areas — verificér m.:
--   SELECT count(*) FROM public.content_items WHERE area IN ('redaktionelt','evergreen');):
--   ALTER TABLE public.content_items DROP CONSTRAINT content_items_area_check;
--   ALTER TABLE public.content_items ADD CONSTRAINT content_items_area_check
--     CHECK (area IN ('classroom', 'academy', 'skabeloner', 'rabataftaler',
--                     'talks', 'quick_wins', 'start_her', 'push', 'ugens_video'));

ALTER TABLE public.content_items DROP CONSTRAINT content_items_area_check;

ALTER TABLE public.content_items ADD CONSTRAINT content_items_area_check
  CHECK (area IN ('classroom', 'academy', 'skabeloner', 'rabataftaler',
                  'talks', 'quick_wins', 'start_her', 'push', 'ugens_video',
                  'redaktionelt', 'evergreen'));
