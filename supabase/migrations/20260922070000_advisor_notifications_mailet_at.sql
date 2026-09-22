-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- RÆKKEFØLGEN — LÆS DEN (CLAUDE.md «Deployment af edge functions»; efter webinaret 22/9):
--   1. DENNE migration (kolonnen) — FØR udrulningen: functionen læser og skriver mailet_at,
--      og en manglende kolonne vælter hver kørsel (42703).
--      Mål kolonnen: GET /rest/v1/advisor_notifications?select=mailet_at&limit=0 → 200.
--   2. merge til main (kilden lander hos Lovable; den kører ikke)
--   3. EKSPLICIT deploy af klokke-mail-cron fra Lovables build-chat — bed den KØRE
--      deploy-værktøjet og vise resultatet; en NY function er aldrig i drift, før det er sket
--   4. tørkørsel MED TAL, før første rigtige mail:
--      SELECT public.kald_edge('klokke-mail-cron');            -- body {} = tørkørsel
--      SELECT status_code, left(content::text, 2000) FROM net._http_response ORDER BY id DESC LIMIT 1;
--      Svaret skal bære raadgivere (id, email, fornavn), raekker_laest, alarm, community, morgen
--      (hver med modtager, klokker, titler, mail = 'toerkoersel'), sprunget og ukendte (tom).
--      Læs tallene: er raekker_laest stort (ulæste klokker fra de sidste 7 dage), er det dét, den
--      første rigtige kørsel mailer. Svarer den med noget andet, eller med intet, er den ikke udrullet.
--   5. første rigtige kørsel i hånden: SELECT public.kald_edge('klokke-mail-cron', '{"dry_run": false}'::jsonb, 60000);
--      og mailene i email_send_log (template_name like 'klokke-mail-%'), stemplerne her:
--      SELECT count(*) FROM public.advisor_notifications WHERE mailet_at IS NOT NULL;
--   6. FØRST derefter cron-migrationen 20260922071000_klokke_mail_cron.sql.
--
-- TIDSSTEMPLET er 03:00 (omnummereret 21/9 aften). Det var først 21:00, så 21:50 — men begge lå
-- FØR migrationer, der i mellemtiden er KØRT i prod: 20260921210000 er B's event_svar_grupper
-- (kørt 21/9 kl. 14:27), 20260922003000 er GA-kolonnerne (kørt kl. 17:01) og 20260922010000 er
-- GA-sporet (kørt kl. 17:48). En migration, der endnu ikke er kørt, må ikke sortere før dem, der
-- er — den, der scanner mappen, læser rækkefølgen som historik. 03:00/03:10 ligger efter alt i
-- main og efter webinar-delingens 20260922020000/20260922021000.
--
-- KLOKKEN SOM MAIL (udkast 21/9-2026, recon-klokker-mail.md): rådgivernes klokker forlod aldrig
-- browseren. klokke-mail-cron sender dem — ALARM til driftModtager, COMMUNITY og MORGEN til hver
-- rådgiver — og skal vide, hvad der ER mailet. Markøren er en kolonne på rækken, ikke en egen
-- tabel: «mailet» er en tilstand på klokken på linje med «læst» (read_at), læses i samme filter
-- (advisor_id IS NOT NULL AND read_at IS NULL AND mailet_at IS NULL), og en tabel ved siden af
-- ville koste et join pr. kørsel og en unikhedsregel for det samme. Sættes af functionen med
-- service-rollen EFTER en vellykket afsendelse; fladen læser den ikke (klokken i Hjemmebane viser
-- læst/ulæst, ikke mailet). Ingen RLS-ændring: SELECT/UPDATE-politikkerne (20260421061016) gælder
-- uændret; en rådgiver KAN sætte kolonnen gennem UPDATE-politikken, som hun kan sætte read_at —
-- fladen gør det ikke.
--
-- Historikken stemples IKKE: klokker fra før mailen fandtes mailes, hvis de er ulæste og under
-- 7 dage gamle (VINDUE_DAGE i klokkeMail.ts). Tørkørslen i trin 4 viser præcis hvilke.

ALTER TABLE public.advisor_notifications
  ADD COLUMN IF NOT EXISTS mailet_at timestamptz NULL;

COMMENT ON COLUMN public.advisor_notifications.mailet_at IS
  'Sat af klokke-mail-cron, når klokken er sendt i en mail (alarm, community eller morgenmailen). NULL = ikke mailet. Sættes efter en vellykket afsendelse; en læst klokke (read_at) mailes aldrig.';

-- Delindeks til functionens filter: kun de rækker, der kan mailes, ligger i det.
CREATE INDEX IF NOT EXISTS advisor_notifications_umailet_idx
  ON public.advisor_notifications (created_at)
  WHERE advisor_id IS NOT NULL AND read_at IS NULL AND mailet_at IS NULL;

-- Efter-verifikation:
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'advisor_notifications' AND column_name = 'mailet_at';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'advisor_notifications' AND indexname = 'advisor_notifications_umailet_idx';
-- Revert: ALTER TABLE public.advisor_notifications DROP COLUMN mailet_at;  -- indekset følger med
