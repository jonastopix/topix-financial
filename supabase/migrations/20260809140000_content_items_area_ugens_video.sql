-- Migration: content_items.area + 'ugens_video'
-- Forside bølge 1, PR 1 (hb-forside-boelge1-recon §B3(iii)): nyt kurateret
-- area til "Denne uges video" på forsiden — eget lille admin-view følger i
-- PR 2 (PushView-forbilledet); udvælgelsesdommen (nyeste published, ikke
-- udløbet) er delt kode i pushSelection.ts.
--
-- KUN content_items udvides. content_collections' area-CHECK (migration
-- 20260804120000:23) røres BEVIDST ikke — ugens video har ingen samlinger.
-- Typerne genbruges (type='video' findes allerede i type-CHECK'en) — ingen
-- type-ændring.
--
-- DEPLOY: køres MANUELT i Lovable -> SQL editor EFTER merge og FØR
-- frontend-"Update" der bruger area'et (PostgREST-skema-cache; ellers
-- CHECK-violation/PGRST-fejl ved gem — samme lærdom som
-- content_items_handout_module-migrationen, 20260805120000).
--
-- FØR-query (verificér constraint-navnet — inline kolonne-CHECK'en
-- auto-navngives content_items_area_check):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.content_items'::regclass AND conname LIKE '%area%';
--
-- ROLLBACK (kør kun hvis ingen rækker har area='ugens_video' —
-- verificér m.: SELECT count(*) FROM public.content_items WHERE area='ugens_video';):
--   ALTER TABLE public.content_items DROP CONSTRAINT content_items_area_check;
--   ALTER TABLE public.content_items ADD CONSTRAINT content_items_area_check
--     CHECK (area IN ('classroom', 'academy', 'skabeloner', 'rabataftaler',
--                     'talks', 'quick_wins', 'start_her', 'push'));

ALTER TABLE public.content_items DROP CONSTRAINT content_items_area_check;

ALTER TABLE public.content_items ADD CONSTRAINT content_items_area_check
  CHECK (area IN ('classroom', 'academy', 'skabeloner', 'rabataftaler',
                  'talks', 'quick_wins', 'start_her', 'push', 'ugens_video'));
