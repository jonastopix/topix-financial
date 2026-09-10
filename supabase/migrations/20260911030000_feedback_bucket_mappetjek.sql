-- Feedback-bucketen får mappetjek (10/9-2026, recon-sikkerhed-og-toast.md
-- §1c). SKREVET, IKKE KØRT. Deploy manuelt i Lovable → SQL editor efter
-- merge (CLAUDE.md). Idempotent.
--
-- MÅLT I REPOET (20260314164757): INSERT-policyen «Authenticated users can
-- upload feedback screenshots» havde WITH CHECK (bucket_id =
-- 'feedback-screenshots') — bucket-navnet alene. Enhver authenticated
-- kunne skrive til enhver sti, også en anden brugers mappe, i enhver
-- størrelse og type; bucketen blev oprettet uden file_size_limit og
-- allowed_mime_types. Læsning var allerede ejermappe eller advisor.
-- chat-attachments og community-bucketerne har mappetjekket
-- (20260806082800, 20260812100000, 20260812130000) — samme form her.
--
-- Klienten (FeedbackDialog.tsx:54-58, :82) uploader til
-- `${user.id}/${Date.now()}.${ext}`, kun image/*, højst 5 MB — bucketen
-- håndhæver nu det samme, så et direkte kald ikke kan mere end fladen.
--
-- ERSTATTER, tilføjer ikke (SECURITY_BASELINE §5).

DROP POLICY IF EXISTS "Authenticated users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own feedback screenshots" ON storage.objects;

CREATE POLICY "Users can upload own feedback screenshots"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Bucketens grænser — som klienten allerede håndhæver.
UPDATE storage.buckets
SET file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/*']
WHERE id = 'feedback-screenshots';

-- ── VERIFIKATION ─────────────────────────────────────────────────────────
--   SELECT cmd, policyname, qual, with_check FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND (qual ILIKE '%feedback-screenshots%' OR with_check ILIKE '%feedback-screenshots%')
--   ORDER BY cmd, policyname;
-- Forventet: 1 INSERT («Users can upload own feedback screenshots», med
-- foldername-tjek) og 2 SELECT (advisor / ejermappe). Ingen UPDATE/DELETE.
--   SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'feedback-screenshots';
-- Forventet: 5242880, {image/*}.
