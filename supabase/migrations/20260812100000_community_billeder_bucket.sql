-- Community-billeder: privat bucket med server-side begrænsninger.
--
-- Community-billeder gemmes i en PRIVAT bucket. Billed-noden i Tiptap-
-- dokumentet bærer en STI, ikke en URL — en signeret URL udløber (10-60
-- min), mens dokumentet lever for evigt, så en gemt URL ville give brudte
-- billeder i gamle opslag. Rendereren signerer ved visning ud fra stien,
-- samme mønster som useChatAttachmentUrl og useCoverUrl. En sti kan
-- desuden aldrig pege ud af huset, hvor en URL-node ville kræve at vi
-- stoler på et prefiks-tjek.
--
-- Formen følger content-assets (20260804120000, afsnit 7): privat fra dag
-- ét, og storage.objects-policies er PERMISSIVE (OR-stak), så hver policy
-- bærer selv bucket-checket. Policies oprettes med pg_policies-eksistens-
-- tjek i DO-blok (CREATE POLICY har ikke IF NOT EXISTS) — samme form som
-- 20260811140000_community.sql.
--
-- Ingen ændring af andre buckets, tabeller eller funktioner.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'community-billeder';
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE '%community%' ORDER BY policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Bucketen — privat, med server-side begrænsninger
-- ─────────────────────────────────────────────────────────────────────────
-- file_size_limit og allowed_mime_types er BEVIDST NYT: ingen anden bucket
-- i projektet har server-side begrænsninger (alle eksisterende grænser er
-- klient-checks, fx ChatRichInputs 10 MB). Her håndhæves de ved døren, så
-- et håndbygget kald uden om klienten ikke kan lægge 2 GB eller en
-- executable i bucketen. Mønstret bør udbredes til de øvrige buckets.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-billeder',
  'community-billeder',
  false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Policies på storage.objects
-- ─────────────────────────────────────────────────────────────────────────
-- INGEN SELECT-policy: læsning sker udelukkende gennem signering med
-- service-role i en edge function, og service-role behøver ingen policy —
-- samme model som chat-attachments efter 20260806082800, hvor den brede
-- SELECT-policy blev droppet, fordi RLS-gaten bor på rækken i public-
-- skemaet og signeringen sker server-side.
--
-- Ingen UPDATE-policy: et billede erstattes ikke, det uploades på ny sti.

DO $$
BEGIN
  -- INSERT: kun authenticated, kun i eget præfiks ({uid}/...).
  -- chat-attachments' INSERT-policy manglede path-tjekket og lod enhver
  -- authenticated skrive hvor som helst i bucketen (20260317133757) — det
  -- gentages ikke her: præfikset ER ejerskabsmodellen.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'Members can upload own community images') THEN
    CREATE POLICY "Members can upload own community images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'community-billeder'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  -- DELETE: kun egen mappe, samme udtryk.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'Members can delete own community images') THEN
    CREATE POLICY "Members can delete own community images"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'community-billeder'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
