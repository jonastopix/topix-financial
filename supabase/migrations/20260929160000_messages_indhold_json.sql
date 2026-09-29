-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «#» I CHATTEN — dokumentkolonnen (kort m28-hash-i-chatten; Jonas 29/9-2026).
-- Motoren: src/lib/chatDokument.ts. Recon: ~/Downloads/recon-hash-i-chatten.md.
--
-- messages.indhold_json jsonb NULL — chatbeskedens Tiptap-dokument, VED SIDEN AF
-- content. Samme model som Community (community_traade/community_svar har
-- indhold + indhold_json, 20260811190000): dokumentet er sandheden for den flade,
-- der kan tegne det; teksten er det, alle andre læser.
--
-- HVORFOR TO KOLONNER og ikke dokumentet i content:
--   * TRETTEN SKRIVERE skriver content i dag (recon §1): de to chatflader,
--     redigeringen, rapportkommentaren, feedback-svaret, mål-nået-beskeden og
--     syv edge functions (advisor-broadcast, foreslaa-opgave, legat-reminder-cron,
--     create-legat-enrollment, send-welcome-message, nudge-report-no-reflection,
--     run-company-agent). De røres ikke; de skriver content som før, og
--     indhold_json står NULL på deres rækker.
--   * FEM FORMER står allerede i content (recon §4): ren tekst, Tiptap-HTML,
--     ren tekst med et rå <a>, **fed**-markdown og ren tekst med linjeskift.
--     En sjette form (JSON som tekst) ville ramme hver eneste læser.
--   * LÆSERNE — panernes DOMPurify-visning, renTekst (Slack, rådgivernes klokke,
--     svarcitatet), samtalelistens regex og kopiér — læser content og kender det.
--     Med dokumentet ved siden af får de en meningsfuld tekst, uden en linje ændret.
--   * Gamle beskeder røres ikke. En række med indhold_json NULL er en besked
--     fra før, eller fra en af de tolv andre skrivere.
--
-- CHECK: indhold_json er enten NULL eller et JSON-OBJEKT (dokumentets rod
-- {"type":"doc","content":[…]}). Hvidlisten håndhæves ved LÆSNING
-- (parseChatDokument, som parseCommunityDokument) — databasen afviser kun det,
-- der aldrig kan være et dokument (et array, en streng, et tal).
--
-- Ingen ændring af policies, triggere eller indekser. UPDATE-politikkerne er
-- række-politikker uden kolonnebegrænsning (målt 29/9: «Advisors can update
-- messages» og «Users can update own messages within 15 min»; ingen GRANT/REVOKE
-- på messages), så indhold_json kan opdateres sammen med content af de samme,
-- der må redigere i dag.
--
-- FØR (gem resultatet):
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'indhold_json';
--   FACIT FØR: 0 rækker.
--   SELECT conname FROM pg_constraint WHERE conname = 'messages_indhold_json_er_objekt';
--   FACIT FØR: 0 rækker.
--
-- EFTER (samme to):
--   1 række: indhold_json · jsonb · YES
--   1 række: messages_indhold_json_er_objekt
--   Og udefra, FØR Update: GET /rest/v1/messages?select=indhold_json&limit=0 → 200
--   (42703 = kolonnen mangler).
--
-- ROLLBACK:
--   ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_indhold_json_er_objekt;
--   ALTER TABLE public.messages DROP COLUMN IF EXISTS indhold_json;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS indhold_json jsonb NULL;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_indhold_json_er_objekt;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_indhold_json_er_objekt
  CHECK (indhold_json IS NULL OR jsonb_typeof(indhold_json) = 'object');

COMMENT ON COLUMN public.messages.indhold_json IS
  'Chatbeskedens Tiptap-dokument (JSON) ved siden af content (29/9-2026). NULL = en besked uden dokument (alle gamle og alle andre skrivere). content er altid teksten, udledt af dokumentet (src/lib/chatDokument.ts: byggChatBesked) — ikke skrevet frit ved siden af.';
