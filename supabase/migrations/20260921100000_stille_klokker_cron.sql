-- KØRT i prod — målt 20/9-2026 aften (Jonas): cron.job 566 «stille-klokker», schedule 30 4 * * *, active.
-- Rækkefølgen holdt: merge (#1048, cdc90353) → EKSPLICIT deploy af stille-klokker-cron fra build-chat →
-- tørkørsel → svaret læst i net._http_response (laes-toerkoersel.sql) → migrationen.
--
-- TØRKØRSLEN (fundet 28 · ingen_bruger 3 · ingen_login 4 · ringet 0 · fandtes 0 · fejl 0) ramte alle syv:
--   ingen_bruger: WESDEX (234 dage), Din økonomiafdeling (207), Two Socks (206)
--   ingen_login:  Brick Works (145, trin 2), TuaMea (138, trin 2), Capture IT (97, trin 1), Homie (95, trin 1)
--   tavse:        Pro-Vision og E-skilte = ikke_aktiv (regel 2 virker) · aktiv = 19
-- UMÅLT I PROD: grenen for_tidligt (betalt uden bruger, under 30 dage) — Din Forsikringsret og Nordic By Hand
-- har allerede brugere og står blandt de 19. Grenen er kun dækket af stilleDom.test.ts.
-- Første rigtige kørsel: 21/9 kl. 06:30 dansk — de syv ringer for første gang.
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
