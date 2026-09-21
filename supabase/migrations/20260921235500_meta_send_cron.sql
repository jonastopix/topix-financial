-- KØRT i prod — 21/9-2026 kl. 16:18 (Jonas, Lovable SQL editor), efter merge, med en vagt først. EFTER: job 568 meta-send, active true; låsen meta_send_aktiv stadig false (tørkørsel).
-- RÆKKEFØLGEN: SIDST — efter 20260921233000 (kolonnen), 20260921234000 (sporet + låsen), merge,
-- eksplicit deploy af ansoegning-gem OG meta-send-cron, Update, og beviset (README): én
-- hændelse med test_event_code + ansoegning_id set i Metas Test events. Jobbet kører tørt,
-- indtil låsen er slået til (én SQL i 20260921234000) — så det kan køres før låsen uden risiko.
--
-- SLOTTET: hvert 5. minut på minutterne 3,8,13,18,23,28,38,43,48,53,58 — :33 er udeladt, fordi
-- meta-annoncer (03:33) og meta-hentning-vagt (04:33) rammer det. Målt 21/9 mod alle
-- cron.schedule i migrationerne + udkastenes klokke-mail (4-59/15), klaviyo-profil (:17) og
-- webinar-delinger-opbevaring (04:52): ingen af de elleve minutter rammes af nogen plan.
-- Låst af metaSend.guard (kolliderer()). TIMEOUT 60 s (under kald_edge_loft_ms() 150 s),
-- INTERVAL 300 000 ms; functionens eget budget er 45 s (op til 8 s pr. Meta-kald).
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).

SELECT cron.schedule(
  'meta-send',
  '3,8,13,18,23,28,38,43,48,53,58 * * * *',
  $job$
  SELECT public.kald_edge(
    'meta-send-cron',
    '{"dry_run": false}'::jsonb,
    60000,       -- timeout: under kald_edge_loft_ms() (150 s); functionens eget budget er 45 s
    300000       -- jobbets interval (5 min) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);

-- Efter-verifikation:
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'meta-send';
--   SELECT status_code, left(content::text, 800) FROM net._http_response ORDER BY id DESC LIMIT 1;
--   -- Sporet: SELECT event_id, art, udfald, forsoeg, events_received, fejl, sendt_at FROM public.meta_haendelser ORDER BY sidste_forsoeg_at DESC LIMIT 10;
-- Revert: SELECT cron.unschedule('meta-send');
