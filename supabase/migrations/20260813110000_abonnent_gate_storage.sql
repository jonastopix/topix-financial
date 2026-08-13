-- Abonnent-gate paa storage: content-assets lukkes med medlemskabsdommen.
--
-- Sidste led i abonnent-graensen, efter 20260813100000 (indhold) og
-- 20260813104000 (events).
-- Maalt i produktion 13-08-2026: raekkerne i content_item_attachments og
-- content_items er lukkede, men FILERNE bag dem laa aabne — SELECT-policyen
-- paa storage.objects for bucket 'content-assets' kraevede kun
-- bucket_id = 'content-assets' for enhver authenticated. Bucket'en er
-- privat og rummer 9 filer i mapperne attachments, covers og templates.
-- Raadgivere har INGEN company_members-raekke og faar derfor
-- har_aktivt_medlemskab = false. Uden en egen SELECT-doer ville de miste
-- adgang til coverbilleder i admin-fladerne. Doeren oprettes i samme
-- migration — samme laere som event_registrations i 20260813093000.
-- KENDT BEGRAENSNING: her er ingen area-hvidliste som i 20260813100000,
-- fordi filerne er mappedelt (attachments/covers/templates), ikke
-- area-delt. En abonnent faar derfor ingen filer fra denne bucket. Det er
-- uden virkning i dag, fordi area='talks' har 0 raekker. Faar talks
-- senere coverbilleder, skal denne policy revideres, saa abonnenter kan se
-- dem. Podcast-halvdelen rammes ikke: den kommer fra eksternt RSS.
--
-- Deploy: koeres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter koersel med:
--   SELECT policyname, cmd, qual FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND qual LIKE '%content-assets%'
--   ORDER BY policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- content-assets: medlems-SELECT strammes, raadgiver-SELECT-doer oprettes
-- ─────────────────────────────────────────────────────────────────────────
--
-- DROP POLICY-begrundelse (jf. CLAUDE.md-kravet): CREATE POLICY har ikke
-- OR REPLACE, saa medlems-policyen droppes og genskabes med NOEJAGTIG
-- samme navn og med public.har_aktivt_medlemskab(auth.uid()) AND'et paa.
-- storage.objects-policies er PERMISSIVE (OR-stak), saa raadgiver-doeren
-- nedenfor staar ved siden af uden at aabne noget for andre. Upload/
-- update/delete-policyerne for content-assets og ALLE andre buckets
-- roeres IKKE.

DROP POLICY "Members can read content assets" ON storage.objects;
CREATE POLICY "Members can read content assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'content-assets'
    AND public.har_aktivt_medlemskab(auth.uid())
  );

CREATE POLICY "Advisors can read content assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'content-assets'
    AND public.has_role(auth.uid(), 'advisor'::app_role)
  );
