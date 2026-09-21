-- KØRT i prod — 21/9-2026 kl. 15:50 (Jonas, Lovable SQL editor), FØR merge, med en vagt først. EFTER: user_agent text.
-- RÆKKEFØLGEN (I AFTEN, 21/9-2026 — webinar 22/9 kl. 09): 1) DENNE migration → mål kolonnen:
--   GET /rest/v1/ansoegninger?select=user_agent&limit=0 → 200 (anon-nøglen fra bundlen).
-- 2) 20260921234000_meta_haendelser.sql. 3) merge. 4) eksplicit deploy af ansoegning-gem OG
-- meta-send-cron. 5) Update. 6) beviset (README). 7) 20260921235500_meta_send_cron.sql.
--
-- BESLUTTET (Jonas 21/9 aften, pkt. 2): browserens user agent gemmes ved «opret» — KUN når
-- fbclid er sat (dataminimering): Meta kræver client_user_agent for website-hændelser
-- («The client_user_agent is required for website events shared using the Conversions API»,
-- developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters),
-- og kun annonce-ansøgere sendes. ansoegning-gem læser request-headeren user-agent (≤ 512 tegn,
-- som aftale_spor) og skriver den i SAMME fail-soft update som annoncesporet (gemAnnoncespor):
-- mangler kolonnen, eller fejler skrivningen, går ansøgningen uforstyrret videre.
-- Persondatateksten (src/lib/ansoegning/persondata.ts) siger det: «… og hvilken slags browser du brugte».

ALTER TABLE public.ansoegninger
  ADD COLUMN IF NOT EXISTS user_agent text NULL;

COMMENT ON COLUMN public.ansoegninger.user_agent IS
  'Browserens user agent ved «opret» (≤ 512 tegn), KUN gemt når fbclid er sat (21/9-2026, dataminimering). Sendes til Meta som client_user_agent af meta-send-cron — aldrig navn, mail, telefon, CVR eller svar. Ingen RLS-ændring: kolonnen læses kun serverside.';

-- Efter-verifikation:
--   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ansoegninger' AND column_name = 'user_agent';
-- Revert: ALTER TABLE public.ansoegninger DROP COLUMN user_agent;
