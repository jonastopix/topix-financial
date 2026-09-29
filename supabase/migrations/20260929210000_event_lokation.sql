-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- events.lokation — hvor et fysisk event holdes (29/9-2026, mangelliste-kortet «Events har ingen
-- lokation — et fysisk event kan ikke sige hvor»). KUN TILFØJENDE: én nullable tekstkolonne, ingen
-- default, ingen omskrivning af rækker. Eksisterende events får NULL = «ingen lokation».
--
-- RÆKKEFØLGEN: 1) FØR-forespørgslen nedenfor → 2) migrationen (ALTER TABLE) → 3) EFTER-forespørgslen
-- (samme SQL) → 4) REST-målingen → 5) først DERNÆST merge/Update. Frontenden SELECTer `*` fra events
-- og vælter derfor ikke uden kolonnen, men editorens «Lokation (adresse)» SKRIVER kolonnen: gemmes et
-- event med udfyldt lokation FØR kolonnen findes, svarer PostgREST med en fejl (PGRST204/42703), og
-- rådgiveren kan ikke gemme. Derfor migration FØR Update.
--
-- RLS: INGEN ændring. Målt i migrationerne (ikke gættet): events' policies er RÆKKE-policies uden
-- kolonneliste — 20260804120000_hjemmebane_content_layer.sql:309-337 («Members can view non-draft
-- events» FOR SELECT USING status IN (published, cancelled, completed); «Advisors can view all events»
-- / «insert» / «update» / «delete» på has_role(auth.uid(), 'advisor'); «Service role can manage
-- events» FOR ALL), og medlemspolicyen er skærpet med har_aktivt_medlemskab i
-- 20260813104000_abonnent_gate_events.sql:42-49. Ingen kolonne-GRANT/REVOKE på events findes i
-- supabase/migrations (grep). En ny kolonne dækkes derfor af de eksisterende policies: medlemmer med
-- aktivt medlemskab læser den på ikke-kladde-events, rådgivere skriver den. Kolonnen er SYNLIG for
-- alle medlemmer — det er meningen (adressen på et fysisk event), og editorfeltet siger det.
-- supabase/SECURITY_BASELINE.md:474 (events-policies) rører vi ikke.
--
-- ── FØR / EFTER (kør ALENE, ét resultatsæt; Lovables SQL editor eksporterer kun det sidste) ──
-- FØR forventes: kolonne = 'findes ikke'. EFTER forventes: kolonne = 'text'. antal_events skal være
-- ens i FØR og EFTER (ingen rækker røres).
--
--   SELECT 'kolonne' AS sektion,
--          COALESCE((SELECT data_type
--                      FROM information_schema.columns
--                     WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'lokation'),
--                   'findes ikke') AS vaerdi
--   UNION ALL
--   SELECT 'nullable',
--          COALESCE((SELECT is_nullable
--                      FROM information_schema.columns
--                     WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'lokation'),
--                   'findes ikke')
--   UNION ALL
--   SELECT 'antal_events', count(*)::text FROM public.events;
--
-- ── REST-MÅLINGEN (efter migrationen; anon-nøglen står i den udrullede bundle, index-*.js på
--    app.theboardroom.dk — CLAUDE.md «Nye migrations») ──
--   GET /rest/v1/events?select=lokation&limit=0   → 200   (42703 = kolonnen mangler; RLS afgør ikke,
--   om kolonnen findes, så anon-nøglen kan måles uden at se rækker)

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS lokation text NULL;

COMMENT ON COLUMN public.events.lokation IS
  'Hvor et fysisk event holdes: fri tekst (adresse), valgfri, højst 200 tegn (valideres i editoren, EventEditor). NULL = ingen lokation. Vises på eventsiden og eventkortene ved siden af «Online» (meet_url) og bliver LOCATION i kalenderfilen (src/lib/kalenderfil.ts). Synlig for alle medlemmer (29/9-2026). Ingen RLS-ændring: de eksisterende række-policies dækker kolonnen.';

-- ── ROLLBACK (kun hvis kolonnen skal væk igen; der er endnu ingen data i den lige efter migrationen —
--    har rådgivere udfyldt den siden, SELECT id, title, lokation FROM public.events WHERE lokation IS NOT NULL
--    og skriv værdierne ud FØR droppet, så de kan genskabes; DROP COLUMN sletter data og kræver Jonas' ja) ──
--   ALTER TABLE public.events DROP COLUMN IF EXISTS lokation;
