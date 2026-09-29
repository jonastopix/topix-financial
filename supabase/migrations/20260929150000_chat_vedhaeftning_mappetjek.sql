-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- CHAT-VEDHÆFTNINGER: mappetjek på upload (29/9-2026, ~/Downloads/recon-video-i-chatten.md §2).
--
-- HULLET: «Authenticated users can upload chat attachments» på storage.objects
-- (20260317133757_…sql:7-10) har WITH CHECK (bucket_id = 'chat-attachments')
-- alene. Enhver authenticated kan skrive hvor som helst i bucketen — også i en
-- anden brugers mappe. SECURITY_BASELINE.md (bucket chat-attachments, «Remaining
-- items») har sagt det siden 6/8. Ingen migration har ændret politikken siden.
--
-- TO MIGRATIONSKOMMENTARER VAR FORKERTE. De påstår, at mappetjekket findes:
--   20260911030000_feedback_bucket_mappetjek.sql:12-13
--     «chat-attachments og community-bucketerne har mappetjekket (20260806082800, …)»
--   20260903233000_messages_update_15min.sql:56-57
--     «chat-attachments blev lukket 6/8 og mangler det IKKE»
-- 20260806082800 gjorde bucketen privat og droppede SELECT-politikken — den
-- rørte ikke INSERT. DELETE-politikken har haft mappetjekket fra starten;
-- INSERT har aldrig haft det. De gamle filer røres ikke; rettelsen står her.
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
--   FACIT FØR: 1 række, cmd INSERT, with_check (bucket_id = 'chat-attachments'::text)
--   Og målingen i ~/Downloads/rapport-chat-vedhaeftning-sti.md (sektion a):
--   hvor mange objekter ligger i en mappe, der ikke er en bruger?
--
-- EFTER (samme SELECT):
--   1 række, with_check ((bucket_id = 'chat-attachments'::text) AND
--   ((storage.foldername(name))[1] = (auth.uid())::text))
--
-- ROLLBACK (den gamle politik ordret, 20260317133757_…sql:7-10):
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
