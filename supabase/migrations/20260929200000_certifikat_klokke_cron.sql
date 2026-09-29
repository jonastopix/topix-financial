-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- RÆKKEFØLGEN (CLAUDE.md «Deployment af edge functions»): merge → EKSPLICIT deploy af
-- certifikat-klokke fra build-chat (bed den KØRE deploy-værktøjet og vise resultatet) →
-- tørkørsel i hånden, svaret læst → FØRST DA denne migration.
--
-- Klokken «Dit certifikat er klar» (certifikat trin 2, 29/9-2026): certifikat-klokke,
-- én gang i døgnet. Dommen bor i _shared/certifikatKlokke.ts (åbningsdato = startdato
-- + 12 måneder − 7 dage, ren dansk kalender; udvalgt med «åbningsdato <= i dag», så
-- også dem, hvis område allerede ER åbent, får klokken én gang — Jonas 29/9).
-- Én-gangen er notifications' UNIQUE (user_id, dedup_key) med
-- dedup_key «certifikat_klar:<company_id>:<åbningsdato>» — en daglig kørsel skriver
-- intet nyt, og en dag uden kørsel taber ingen klokke.
--
-- Ingen tabel, ingen kolonne: klokken er notifications (writeNotificationToMany),
-- grundmængden er companies.certificate_eligible (migration 20260929190000),
-- modtagerne er company_members minus user_roles advisor/admin minus
-- certificate_downloads.
--
-- KØR FØRST EN TØRKØRSEL i hånden og læs svaret, før jobbet planlægges:
--   SELECT public.kald_edge('certifikat-klokke');            -- body {} = tørkørsel
--   … og læs svaret: SELECT id, status_code, content FROM net._http_response ORDER BY id DESC LIMIT 1;
--   (klar: virksomhed, aabningsdato, modtagere; sprunget pr. grund; skrevet = 0).
--
-- SLOTTET 06:15 UTC = 08:15 dansk sommertid (CEST, UTC+2) og 07:15 dansk vintertid
-- (CET, UTC+1). Klokken står klar, når medlemmet åbner appen om morgenen; mailen går
-- af send-notification-email (priority important) i dens næste kørsel efter 15 min.
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).

SELECT cron.schedule(
  'certifikat-klokke',
  '15 6 * * *',
  $job$
  SELECT public.kald_edge(
    'certifikat-klokke',
    '{"dry_run": false}'::jsonb,
    60000,       -- timeout: under kald_edge_loft_ms() (150 s)
    86400000     -- jobbets interval (24 t) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);

-- Efter-verifikation (kør med det samme, bogfør svaret i dette filhoved):
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'certifikat-klokke';
--   -- Første kørsel næste morgen: klokken hos de berettigede medlemmer, og
--   SELECT company_id, dedup_key, count(*) FROM public.notifications
--   WHERE type = 'certifikat_klar' GROUP BY 1, 2 ORDER BY 1;
-- Revert: SELECT cron.unschedule('certifikat-klokke');
