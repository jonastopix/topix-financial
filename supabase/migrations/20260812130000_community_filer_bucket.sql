-- Community-filer: privat bucket til vedhæftede dokumenter.
--
-- Vedhæftede filer i community-opslag (Excel, PDF, Word, XML) kan ikke
-- ligge i community-billeder-bucketen: den har en MIME-hvidliste, der kun
-- tillader billedtyper. De får deres egen bucket med samme model —
-- privat, sti i dokumentet, signering ved visning bag adgangsdommen.
-- SVG er BEVIDST ikke på listen: en SVG er scriptbart XML, og en signeret
-- URL åbnet i en fane ville køre i browserkonteksten. XML er med, fordi
-- den downloades frem for at blive vist — men det kræver, at rendereren
-- altid sætter download-attributten og aldrig åbner filen inline. Skal
-- SVG med senere, kræver det sanitisering server-side først.
--
-- Formen følger community-billeder (20260812100000): privat fra dag ét,
-- server-side begrænsninger i bucketen, og storage.objects-policies er
-- PERMISSIVE (OR-stak), så hver policy bærer selv bucket-checket.
-- Policies oprettes med pg_policies-eksistens-tjek i DO-blok
-- (CREATE POLICY har ikke IF NOT EXISTS).
--
-- Ingen ændring af andre buckets, tabeller eller funktioner.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'community-filer';
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE '%community%' ORDER BY policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Bucketen — privat, med server-side begrænsninger
-- ─────────────────────────────────────────────────────────────────────────
-- 25 MB-loftet er samme loft som regnskabsuploaden i FileUploadZone
-- (MAX_FILE_SIZE = 25 * 1024 * 1024) — et dokument-loft, ikke et
-- billed-loft. MIME-listen, læst uden opslag:
--   application/pdf                                                    → pdf
--   application/vnd.openxmlformats-officedocument.spreadsheetml.sheet  → xlsx
--   application/vnd.ms-excel                                           → xls
--   application/vnd.openxmlformats-officedocument.wordprocessingml.document → docx
--   application/msword                                                 → doc
--   text/xml + application/xml                                         → xml
--     (browsere og OS'er er uenige om hvilken af de to, XML meldes som —
--      begge accepteres)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-filer',
  'community-filer',
  false,
  26214400,  -- 25 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/xml',
    'application/xml'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Policies på storage.objects
-- ─────────────────────────────────────────────────────────────────────────
-- INGEN SELECT-policy: læsning sker udelukkende gennem signering med
-- service-role i en edge function, og service-role behøver ingen policy —
-- samme model som community-billeder og chat-attachments efter
-- 20260806082800 (RLS-gaten bor i public-skemaet, signeringen sker
-- server-side).
--
-- Ingen UPDATE-policy: en fil erstattes ikke, den uploades på ny sti.

DO $$
BEGIN
  -- INSERT: kun authenticated, kun i eget præfiks ({uid}/...).
  -- chat-attachments' INSERT-policy manglede path-tjekket og lod enhver
  -- authenticated skrive hvor som helst i bucketen (20260317133757) — det
  -- gentages ikke her: præfikset ER ejerskabsmodellen.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'Members can upload own community files') THEN
    CREATE POLICY "Members can upload own community files"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'community-filer'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  -- DELETE: kun egen mappe, samme udtryk.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'Members can delete own community files') THEN
    CREATE POLICY "Members can delete own community files"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'community-filer'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
