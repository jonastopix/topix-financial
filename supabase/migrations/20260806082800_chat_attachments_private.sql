-- CHAT-ATTACHMENTS PR 4 — bucket flippes til privat.
-- Eksekveret manuelt i prod 2026-08-06 08:28 — committes for
-- historik/paritet. Bevist: negativ (public-URL → 400 NoSuchBucket)
-- og positiv (rendering via frisk signering fra get-chat-attachment-url).
-- Rollback: public=true + genopret SELECT-policyen
-- (using bucket_id = 'chat-attachments').
--
-- Begrundelse for DROP POLICY (baseline-reglen): "Anyone can read chat
-- attachments" var TO public uden path-/membership-check (oprettet i
-- 20260317133757) og er funktionelt afløst af get-chat-attachment-url,
-- som gater læsning via RLS på messages-rækken og udsteder signerede
-- URL'er (600 s). Signering sker med service-role og behøver ingen
-- SELECT-policy på storage.objects.

update storage.buckets set public = false where id = 'chat-attachments';

drop policy if exists "Anyone can read chat attachments" on storage.objects;
