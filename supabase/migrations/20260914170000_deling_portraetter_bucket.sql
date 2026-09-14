-- Delingskreativens portræt: en PRIVAT bucket kun til kreativen (14/9-2026,
-- Jonas' beslutning efter recon-kreativ-persistens.md §4 vej (b)).
-- SKREVET, IKKE KØRT. Deploy manuelt i Lovable → SQL editor efter merge
-- (CLAUDE.md). Idempotent.
--
-- HVORFOR ET NYT STED: en delingsside må ikke ændre hendes profilbillede —
-- et billede der virker i en optagelseskreativ er ikke nødvendigvis det hun
-- vil have som avatar. Logoet går den ANDEN vej (vej (a)): det er
-- virksomhedens og gemmes i den eksisterende bucket company-logos +
-- companies.logo_url — ingen ændring her.
--
-- FORMEN følger feedback-bucketen (20260911030000) og community-billeder
-- (20260812100000): privat bucket, grænser i bucket-rækken, policies med
-- mappetjek — «medlemmet kan læse og skrive sit eget, og INTET andet».
-- Grænserne er avatar-uploadens (KontoView.tsx:94-95: image/*, 2 MB) —
-- ingen ny grænse; de håndhæves blot også ved døren.
--
-- STIEN er deterministisk: {uid}/portraet, upsert ved nyt valg. Derfor
-- ingen kolonne der husker URL'en: fladen lister sin egen mappe og signerer
-- stien ved visning (src/lib/delingsbilleder.ts: hentPortraetUrl). En
-- signeret URL udløber (1 time), en sti gør ikke — samme grund som
-- community-billeder gemmer stier, ikke URL'er.
--
-- UPDATE-policyen er med, fordi upsert (x-upsert) kræver INSERT OG UPDATE.
-- SELECT-policyen er kun ejermappen: ingen «anyone can view» som avatars
-- (20260227191148:7-9) — portrættet er hendes, og PNG'en er det der deles.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Bucketen — privat, 2 MB, image/* (som avatar-uploaden i klienten)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deling-portraetter',
  'deling-portraetter',
  false,
  2 * 1024 * 1024,
  ARRAY['image/*']
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Policies på storage.objects — kun egen mappe ({uid}/...), alle fire cmd
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'Members can view own deling portrait') THEN
    CREATE POLICY "Members can view own deling portrait"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'deling-portraetter'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'Members can upload own deling portrait') THEN
    CREATE POLICY "Members can upload own deling portrait"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'deling-portraetter'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'Members can update own deling portrait') THEN
    CREATE POLICY "Members can update own deling portrait"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'deling-portraetter'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'deling-portraetter'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'Members can delete own deling portrait') THEN
    CREATE POLICY "Members can delete own deling portrait"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'deling-portraetter'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- ── VERIFIKATION ─────────────────────────────────────────────────────────
--   SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'deling-portraetter';
-- Forventet: public = false, 2097152, {image/*}.
--   SELECT cmd, policyname FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE '%deling portrait%' ORDER BY cmd;
-- Forventet: fire rækker — DELETE, INSERT, SELECT, UPDATE — alle med
-- foldername-tjek mod auth.uid().
