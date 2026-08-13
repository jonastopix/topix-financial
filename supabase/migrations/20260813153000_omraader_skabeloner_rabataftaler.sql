-- Migration: area-CHECKs — 'skabeloner' ud, 'rabataftaler' ind paa samlinger
--
-- Produktbeslutning 13-08-2026 (Jonas): 'skabeloner' nedlaegges som
-- omraade. En skabelon haenges paa den lektion den hoerer til, som
-- vedhaeftning via HbMaterials (content_item_attachments). Koden er
-- ryddet i PR #369.
-- 'rabataftaler' faar sit eget miljoe. Vaerdien er allerede tilladt paa
-- content_items (20260809170000), men IKKE paa content_collections —
-- den tilfoejes her, saa samlinger er mulige naar miljoeet bygges.
-- 'talks' beholdes begge steder. Noeglen maa ikke omdoebes: den baerer
-- abonnent-hvidlisten i RLS (20260813100000, tre policies). Kun
-- labelet er aendret til "Optagelser" (PR #370).
--
-- Maalt i produktion 13-08-2026 FOER koersel:
--   content_items area='skabeloner'        : 0 raekker
--   content_collections area='skabeloner'  : 0 raekker
--   content_items area='rabataftaler'      : 0 raekker
--   content_items area='talks'             : 1 raekke
--   community_traade m. henvisning til talks/skabeloner : 0
--   community_svar   m. henvisning til talks/skabeloner : 0
-- Der er altsaa intet at miste ved at fjerne vaerdien.
--
-- Deploy: koeres MANUELT i Lovable -> SQL editor efter merge.
-- Verificér efter koersel med:
--   SELECT conname, pg_get_constraintdef(c.oid)
--   FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
--   WHERE t.relname IN ('content_items','content_collections')
--     AND c.contype = 'c' AND pg_get_constraintdef(c.oid) LIKE '%area%';

-- ── content_items: navngiven constraint, droppes og genskabes uden
--    'skabeloner' ──

ALTER TABLE public.content_items DROP CONSTRAINT content_items_area_check;
ALTER TABLE public.content_items ADD CONSTRAINT content_items_area_check
  CHECK (area IN ('classroom', 'academy', 'rabataftaler', 'talks',
                  'quick_wins', 'start_her', 'push', 'ugens_video',
                  'redaktionelt', 'evergreen'));

-- ── content_collections: constrainten blev oprettet INLINE i CREATE TABLE
--    (20260804120000:23) og har et autogenereret navn. Den slaas derfor op
--    og droppes dynamisk, saa migrationen ikke gaetter paa navnet. ──

DO $$
DECLARE
  navn text;
BEGIN
  SELECT c.conname INTO navn
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'content_collections'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%area%';

  IF navn IS NULL THEN
    RAISE EXCEPTION 'Fandt ingen area-CHECK paa content_collections';
  END IF;

  EXECUTE format('ALTER TABLE public.content_collections DROP CONSTRAINT %I', navn);
END $$;

-- Den nye constraint faar et EKSPLICIT navn, saa fremtidige migrationer
-- ikke skal slaa det op igen.
ALTER TABLE public.content_collections ADD CONSTRAINT content_collections_area_check
  CHECK (area IN ('classroom', 'academy', 'rabataftaler', 'talks',
                  'quick_wins', 'start_her'));
