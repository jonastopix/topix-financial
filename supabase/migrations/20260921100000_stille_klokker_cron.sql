-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- De to klokker, der ikke fandtes (20/9-2026): «betalt, ingen bruger» og
-- «ingen login» — stille-klokker-cron, én gang i døgnet. Dommen og
-- tærsklerne bor i _shared/stilleDom.ts (30·60·90 og 90·120·150 + vinduet),
-- målt på kontrakter 20/9: 5 af 28 betalende har aldrig fået et menneske
-- ind, 4 har en bruger, der ikke har været inde i 30 dage. Ingen klokke
-- ringede.
--
-- Ingen tabel, ingen kolonne: klokken er advisor_notifications (vagtens
-- form via skrivRaadgiverBesked), grundmængden er kontrakter, brugerne er
-- company_members, stilheden er user_login_log.
--
-- KØR FØRST EN TØRKØRSEL i hånden og læs svaret, før jobbet planlægges:
--   SELECT public.kald_edge('stille-klokker-cron');            -- body {} = tørkørsel
--   … og læs functionens svar i Lovable → Edge functions → Logs
--   (ville_ringe med titler; intet skrives).
--
-- SLOTTET 04:30 UTC (06:30 dansk sommertid, 05:30 vinter) er ledigt — målt
-- 6/9: 04:00 opgave-udløb, 05:00 agent-runs, 06:00 weekly-focus. Klokken
-- står klar, når rådgiveren åbner forsiden om morgenen.
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).

SELECT cron.schedule(
  'stille-klokker',
  '30 4 * * *',
  $job$
  SELECT public.kald_edge(
    'stille-klokker-cron',
    '{"dry_run": false}'::jsonb,
    60000,       -- timeout: under kald_edge_loft_ms() (150 s)
    86400000     -- jobbets interval (24 t) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);

-- Efter-verifikation (kør med det samme, bogfør svaret i dette filhoved):
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'stille-klokker';
--   -- Første kørsel næste morgen: klokken i rådgiverens forside, og
--   SELECT type, title, count(*) FROM public.advisor_notifications
--   WHERE type IN ('stille_ingen_bruger', 'stille_ingen_login') GROUP BY 1, 2 ORDER BY 2;
-- Revert: SELECT cron.unschedule('stille-klokker');
