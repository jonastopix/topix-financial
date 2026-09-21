-- KØRT i prod — 21/9-2026 kl. 21:02 (Jonas, Lovable SQL editor), efter merge, med en vagt først. EFTER: job 569 ga-send, '2,12,22,32,42,54 * * * *', aktiv; låsen ga_send_aktiv slået til samtidig (false → true).
-- RÆKKEFØLGEN: SIDST — efter 20260922003000 (kolonnerne), 20260922010000 (sporet + låsen),
-- merge, eksplicit deploy af ga-send-cron, og beviset (README): debug-kørslen med tom
-- validationMessages og ÉN rigtig hændelse i GA4 Realtime. Jobbet kører TØRT, indtil låsen
-- er slået til, så det kan planlægges før beviset uden risiko.
--
-- SLOTTET: minutterne 2, 12, 22, 32, 42 og 54 — cirka hvert tiende minut. Målt 21/9 aften
-- mod ALLE cron.schedule i migrationerne PLUS de udkast, der ikke er merget endnu
-- (klokke-mail 4-59/15, klaviyo-profil :17, webinar-delinger-opbevaring 04:52). De ledige
-- minutter i timen var præcis: 2, 9, 12, 14, 22, 24, 27, 29, 32, 37, 39, 42, 44, 47, 54, 57, 59.
-- :52 var det naturlige sjette trin, men det er opbevaringsjobbets — derfor :54.
-- Låst af gaSend.guard (kolliderer()).
-- TIMEOUT 60 s (under kald_edge_loft_ms() 150 s) og INTERVAL 480 000 ms = 8 min, som er det
-- KORTESTE faktiske mellemrum i listen (54 → 2); kald_edge afviser en timeout, der ikke er
-- kortere end intervallet. Functionens eget budget er 45 s.
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).

SELECT cron.schedule(
  'ga-send',
  '2,12,22,32,42,54 * * * *',
  $job$
  SELECT public.kald_edge(
    'ga-send-cron',
    '{"dry_run": false}'::jsonb,
    60000,       -- timeout: under kald_edge_loft_ms() (150 s); functionens eget budget er 45 s
    480000       -- korteste mellemrum i planen (8 min) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);

-- EFTER-tjek:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'ga-send';
--   select status_code, left(content::text, 800) from net._http_response order by id desc limit 1;
--   select event_id, art, udfald, forsoeg, sendt_at, fejl from public.ga_haendelser order by sidste_forsoeg_at desc limit 10;
-- ROLLBACK: select cron.unschedule('ga-send');
