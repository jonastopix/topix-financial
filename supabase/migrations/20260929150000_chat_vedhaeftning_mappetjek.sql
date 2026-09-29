-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- CHAT-VEDHÆFTNINGER: mappetjek på upload (29/9-2026, ~/Downloads/recon-video-i-chatten.md §2).
--
-- DET, DER BLEV TROET (Claude, 29/9): «Authenticated users can upload chat
-- attachments» på storage.objects har i REPOET (20260317133757_…sql:7-10) WITH
-- CHECK (bucket_id = 'chat-attachments') alene, og ingen migration i repoet har
-- ændret den siden. Derfra blev det sluttet, at prod havde et åbent upload-hul
-- (enhver authenticated kunne skrive i en anden brugers mappe). DEN SLUTNING VAR
-- FORKERT: repoets migrationer er ikke prods tilstand.
--
-- DET, MÅLINGEN VISTE (pg_policies i prod 29/9, FØR migrationen blev kørt):
-- politikken havde ALLEREDE mappetjekket — FØR = EFTER. Der var intet hul i prod.
-- De to ældre migrationskommentarer, der siger, at mappetjekket findes
-- (20260911030000_feedback_bucket_mappetjek.sql:12-13 og
-- 20260903233000_messages_update_15min.sql:56-57), beskriver altså prod rigtigt.
-- Hvordan mappetjekket kom i prod, står ikke i repoet.
--
-- DET, MIGRATIONEN DERFOR ER: repoet bragt i overensstemmelse med prod. Den er
-- idempotent — kørt mod prod ændrer den intet, og en database bygget fra repoet
-- får nu den politik, prod har.
--
-- KLIENTEN SKRIVER ALLEREDE SÅDAN: uploadChatAttachments (src/lib/chatAttachments.ts:18)
-- uploader til `${userId}/${ts}-${navn}` med den indloggede brugers id. Politikken
-- nedenfor afviser kun det, klienten aldrig gør. Derfor kan migrationen køres
-- uafhængigt af udrulningen af get-chat-attachment-url.
--
-- DROP POLICY-BEGRUNDELSE (baseline-reglen): en politik kan ikke ændres i
-- stedet; den droppes og genskabes med SAMME navn og mappetjekket AND'et på.
-- Policies er PERMISSIVE og OR-stakkes — derfor må den gamle ikke stå tilbage
-- ved siden af den nye.
--
-- FØR (gem resultatet):
--   SELECT policyname, cmd, roles, qual, with_check
--     FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects'
--      AND policyname = 'Authenticated users can upload chat attachments';
--   FORVENTET FØR (29/9, ud fra repoet): 1 række, cmd INSERT, with_check
--   (bucket_id = 'chat-attachments'::text). MÅLT FØR i prod 29/9: mappetjekket
--   stod der allerede — samme with_check som EFTER nedenfor.
--   Og målingen i ~/Downloads/rapport-chat-vedhaeftning-sti.md (sektion a):
--   hvor mange objekter ligger i en mappe, der ikke er en bruger?
--
-- EFTER (samme SELECT):
--   1 række, with_check ((bucket_id = 'chat-attachments'::text) AND
--   ((storage.foldername(name))[1] = (auth.uid())::text))
--
-- ROLLBACK (repoets gamle politik ordret, 20260317133757_…sql:7-10 — NB: den er
-- SVAGERE end det, prod havde før migrationen; kørt i prod ville den åbne et hul,
-- der aldrig fandtes):
--   DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
--   CREATE POLICY "Authenticated users can upload chat attachments"
--   ON storage.objects FOR INSERT
--   TO authenticated
--   WITH CHECK (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;

CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
