-- KØRT i prod — 22/9-2026 kl. 17:36 (Jonas, Lovable SQL editor), EFTER kolonnen (17:20), udrulningen (~17:22), tørkørslen (17:24) og den første rigtige kørsel i hånden (17:33). FØR: «(findes ikke)». EFTER: cron.job 572, jobnavn klokke-mail, «4-59/15 * * * *», active.
-- RÆKKEFØLGEN — LÆS DEN (CLAUDE.md «Deployment af edge functions»):
--   1. kolonne-migrationen 20260922070000_advisor_notifications_mailet_at.sql (FØR udrulningen)
--   2. merge til main (kilden lander hos Lovable; den kører ikke)
--   3. EKSPLICIT deploy af klokke-mail-cron fra Lovables build-chat — bed den KØRE
--      deploy-værktøjet og vise resultatet
--   4. tørkørsel MED TAL (se 20260922070000, trin 4) og første rigtige kørsel i hånden (trin 5)
--   5. FØRST derefter denne migration (cron-jobbet).
--
-- KLOKKEN SOM MAIL (udkast 21/9-2026): klokke-mail-cron sender rådgivernes klokker som mail —
-- ALARM til driftModtager straks, COMMUNITY til hver rådgiver straks, MORGEN til hver rådgiver i
-- den første kørsel efter kl. 07 dansk (klokkeMail.ts). Ét job hvert kvarter dækker alle tre:
-- morgenmailen går kl. 07:04 dansk (første slot efter 07:00) sommer som vinter, fordi timen
-- dømmes i functionen (kbhDele), ikke i cron-udtrykket (pg_cron kører i UTC).
--
-- SLOTTET: hvert kvarter på OFFSET 4 — minutterne 4, 19, 34, 49. Målt 21/9 mod alle cron.schedule
-- i migrationerne (30 forekomster, 28 jobs):
--   hver time:   */5 (0,5,…,55: cleanup-stale-processing-reports, process-notification-emails),
--                */15 (0,15,30,45: event-reminders-time, klaviyo-hentning, det gamle
--                send-notification-email), 1-59/5 (1,6,…,56: klaviyo-gensend), :07 (vagt-cron),
--                :17 (klaviyo-profil), 5-15 UTC hverdage */15 (ansoegning-rykker)
--   faste tider: :00 (mange), :05 (04:05), :10 (04:10), :15 (09:15), :20 (05:20), :30 (04:30, 09:30),
--                :33 (03:33, 04:33)
--   Offset 2 rammer :17 (klaviyo-profil), offset 3 rammer :33 (meta ×2). Offset 4 (4, 19, 34, 49)
--   rammer intet — hverken hver time eller på en fast tid. Låst af klokkeMail.guard (kolliderer()).
-- TIMEOUT 60 s (under kald_edge_loft_ms() 150 s) og INTERVAL 900 000 ms (15 min) — kald_edge
-- afviser en timeout, der ikke er kortere end intervallet. Højst fem mails pr. kørsel (1 alarm +
-- 2 community + 2 morgen) — intet budget er nødvendigt.
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).

SELECT cron.schedule(
  'klokke-mail',
  '4-59/15 * * * *',
  $job$
  SELECT public.kald_edge(
    'klokke-mail-cron',
    '{"dry_run": false}'::jsonb,
    60000,       -- timeout: under kald_edge_loft_ms() (150 s)
    900000       -- jobbets interval (15 min) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);

-- Efter-verifikation (kør med det samme, bogfør svaret i dette filhoved):
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'klokke-mail';
--   -- Første kørsel inden for 15 min: svaret på det nyeste id i net._http_response, og
--   SELECT status_code, left(content::text, 800) FROM net._http_response ORDER BY id DESC LIMIT 1;
--   -- Mailene:
--   SELECT created_at, template_name, recipient_email, status FROM public.email_send_log
--    WHERE template_name LIKE 'klokke-mail-%' ORDER BY created_at DESC LIMIT 10;
--   -- Stemplerne:
--   SELECT type, count(*) FROM public.advisor_notifications WHERE mailet_at IS NOT NULL GROUP BY type;
-- Revert: SELECT cron.unschedule('klokke-mail');
