-- Præsentationen som onboarding-ritual (11/9-2026, kort 60,
-- recon-b1-medlemmets-foerste-dage.md). SKREVET, IKKE KØRT.
--
-- HVAD: community_traade.kilde_type får en tredje lovlig værdi,
-- 'praesentation', uden kilde-id. Tjeklistens nye punkt «Præsentér dig»
-- er gjort når medlemmet har en tråd med kilde_type = 'praesentation' og
-- status = 'aktiv' — aktiv, fordi punktet handler om at blive set af de
-- andre: en tråd skjult af en rådgiver ses ikke, og medlemmets
-- SELECT-policy viser i forvejen kun aktive (20260811160000:66-69).
-- Fladen sender værdien fra /community?praesentation=1 via
-- opret_community_traad (p_kilde_type). Alle andre opslag er uændrede.
--
-- HVORFOR EN CHECK-ÆNDRING: opret_community_traad er SECURITY DEFINER og
-- sender p_kilde_type uændret til INSERT uden egen kontrol — CHECK'en er
-- vagten, og den må ikke løsnes mere end præcis denne ene gren. Funktionen
-- selv røres IKKE (FORBIDDEN-listen, CLAUDE.md).
--
-- SKAL KØRES FØR «Update» I LOVABLE: fladen sender 'praesentation' så snart
-- frontend-builden er ude, og uden denne migration afviser CHECK'en
-- indsendelsen (23514) — medlemmet får «Opslaget blev ikke delt».
-- Rækkefølge: merge → denne SQL i Lovable → SQL editor → Update.
--
-- PROD FØR KØRSEL (målt 11/9-2026 kl. 11:28 og 11:33, ordret fra
-- pg_get_constraintdef):
--   community_traade_kilde_type_check =
--     CHECK ((kilde_type = ANY (ARRAY['content_item'::text, 'event'::text])))
--   community_traade_kilde_check =
--     CHECK ((((kilde_type IS NULL) AND (kilde_item_id IS NULL) AND (kilde_event_id IS NULL))
--         OR ((kilde_type = 'content_item'::text) AND (kilde_item_id IS NOT NULL) AND (kilde_event_id IS NULL))
--         OR ((kilde_type = 'event'::text) AND (kilde_event_id IS NOT NULL) AND (kilde_item_id IS NULL))))
--   get_community_feed og get_community_traad returnerer t.kilde_type som
--   kolonne uden CASE eller join på typen — de behøver ingen ændring.
--   protect_community_traad_immutable_fields låser kilde_type efter
--   oprettelse — uændret. 10 tråde i tabellen, alle uden kilde.
--
-- Ingen ændring af funktioner, policies eller data. Idempotent (DROP IF
-- EXISTS + ADD).

ALTER TABLE public.community_traade
  DROP CONSTRAINT IF EXISTS community_traade_kilde_type_check;

ALTER TABLE public.community_traade
  ADD CONSTRAINT community_traade_kilde_type_check
  CHECK ((kilde_type = ANY (ARRAY['content_item'::text, 'event'::text, 'praesentation'::text])));

ALTER TABLE public.community_traade
  DROP CONSTRAINT IF EXISTS community_traade_kilde_check;

ALTER TABLE public.community_traade
  ADD CONSTRAINT community_traade_kilde_check
  CHECK ((((kilde_type IS NULL) AND (kilde_item_id IS NULL) AND (kilde_event_id IS NULL))
      OR ((kilde_type = 'content_item'::text) AND (kilde_item_id IS NOT NULL) AND (kilde_event_id IS NULL))
      OR ((kilde_type = 'event'::text) AND (kilde_event_id IS NOT NULL) AND (kilde_item_id IS NULL))
      OR ((kilde_type = 'praesentation'::text) AND (kilde_item_id IS NULL) AND (kilde_event_id IS NULL))));

-- ── VERIFIKATION ─────────────────────────────────────────────────────────
--   SELECT conname, pg_get_constraintdef(oid) AS def
--   FROM pg_constraint
--   WHERE conrelid = 'public.community_traade'::regclass
--     AND conname IN ('community_traade_kilde_type_check', 'community_traade_kilde_check')
--   ORDER BY conname;
-- Forventet: to rækker, begge med 'praesentation' i definitionen —
-- værdilisten med tre værdier, og kombinationen med fire grene (den sidste
-- kilde_type = 'praesentation' AND kilde_item_id IS NULL AND kilde_event_id IS NULL).
