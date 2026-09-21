-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- RÆKKEFØLGEN — LÆS DEN (CLAUDE.md «Deployment af edge functions»; stille-klokker-formen 20/9):
--   1. tabel-migrationen 20260921190000_klaviyo_profil.sql (FØR udrulningen)
--   2. merge til main (kilden lander hos Lovable; den kører ikke)
--   3. EKSPLICIT deploy af klaviyo-profil-cron fra Lovables build-chat — bed den KØRE
--      deploy-værktøjet og vise resultatet; en NY function er aldrig i drift, før det er sket
--   4. tørkørsel:  SELECT public.kald_edge('klaviyo-profil-cron');            -- body {} = tørkørsel
--      SELECT status_code, left(content::text, 1500) FROM net._http_response ORDER BY id DESC LIMIT 1;
--      Svaret skal bære tilmeldinger_laest, tilstand_laest (0 første gang), med_kommende, saet, fjern,
--      uaendret, eksempler med tb_naeste_webinar «YYYY-MM-DD HH:MM:SS» og tekst «tirsdag … kl. …»,
--      skrevet = 0. Svarer den med noget andet, eller med intet, er den ikke udrullet.
--   5. ÉN rigtig skrivning til ÉN mail (beviset — vælg en tilmeldt til 13/10, fx en egen prøveprofil):
--      SELECT public.kald_edge('klaviyo-profil-cron',
--        '{"dry_run": false, "email": "<mail>"}'::jsonb, 60000);
--      Svaret: skrevet 1, lykkedes 1, eksempler[0].udfald 'ok'. Rækken:
--      SELECT * FROM public.klaviyo_profil WHERE email = '<mail>';  → udfald ok, status 200/201.
--      Læs profilen TILBAGE i Klaviyo (profilen → Custom properties): tb_naeste_webinar
--      = «2026-10-13 11:00:00» (typet som DATO — vises som dato, ikke som tekst) og
--      tb_naeste_webinar_tekst = «tirsdag 13. oktober kl. 11.00».
--   6. FØRST derefter denne migration (cron-jobbet). Første rigtige kørsel = backfill for alle.
--
-- SLOTTET: hver time på MINUT 17. Målt 21/9 mod alle cron.schedule i migrationerne (d8ec07ca):
--   */5 * * * *       × 2   (cleanup-stale-processing-reports, process-notification-emails)
--   1-59/5 * * * *    × 1   (klaviyo-gensend: 1, 6, 11, …, 56)
--   */15 * * * *      × 3   og  */15 5-15 * * 1-5  × 1
--   faste minutter:   0 (mange), 5 (agentforslag-udloeb 04:05), 7 (vagt-cron, hver time),
--                     10 (opgave-forfald 04:10), 15 (onboarding-rytme 09:15), 20 (report-review 05:20),
--                     30 (stille-klokker 04:30, legat 09:30), 33 (meta-annoncer 03:33, meta-hentning-vagt 04:33)
--   Optaget hver time: alle multipla af 5 (*/5), 1 mod 5 (gensenderen), :07 (vagten). Minut 17 er
--   ikke et multiplum af 5, 17 mod 5 = 2, og ingen fast plan rammer det — ledigt i alle timer.
-- TIMEOUT 60 s (under kald_edge_loft_ms() 150 s) og INTERVAL 3 600 000 ms (1 time) — kald_edge
-- afviser en timeout, der ikke er kortere end intervallet. Functionens eget budget er 45 s;
-- det, der ikke nås, hedder «udsat» i svaret og tages næste time.
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).

SELECT cron.schedule(
  'klaviyo-profil',
  '17 * * * *',
  $job$
  SELECT public.kald_edge(
    'klaviyo-profil-cron',
    '{"dry_run": false}'::jsonb,
    60000,       -- timeout: under kald_edge_loft_ms() (150 s); functionens eget budget er 45 s
    3600000      -- jobbets interval (1 time) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);

-- Efter-verifikation (kør med det samme, bogfør svaret i dette filhoved):
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'klaviyo-profil';
--   -- Første kørsel inden for en time — backfill: svaret på det nyeste id i net._http_response, og
--   SELECT udfald, count(*) FROM public.klaviyo_profil GROUP BY 1;
--   SELECT email, tb_naeste_webinar, tb_naeste_webinar_tekst, skrevet_at FROM public.klaviyo_profil
--    ORDER BY skrevet_at DESC NULLS LAST LIMIT 10;
-- Revert: SELECT cron.unschedule('klaviyo-profil');
