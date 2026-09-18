-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge, EFTER
-- 20260918200000_ansoegninger.sql og efter edge functionen
-- ansoegning-rykker-cron er live («View code»).
--
-- Rykkerkøens ENE cron-job (18/9-2026): kalder ansoegning-rykker-cron gennem
-- kald_edge (URL, vault-nøgle, 30 s timeout) hvert kvarter i det danske
-- sendevindue. pg_cron kører i UTC: '*/15 5-15 * * 1-5' er 07–17 dansk
-- sommertid og 06–16 vintertid — bredere end vinduet, og det er meningen:
-- FUNKTIONEN dømmer selv (rykkerkoe.afgoerSending: hverdag, 07 ≤ kl. < 16,
-- helligdage, én mail pr. person pr. dag) og udskyder alt der rammer ved
-- siden af. Cronen er kun hjertet, ikke reglen. Interne handlinger
-- (afholdt, luk, udløb, pause_slut) går i samme kørsel.
--
-- Body {"dry_run": false}: uden body er funktionen TØRKØRSEL (finder og
-- logger, sender intet) — samme mønster som indgangs-paamindelser-cron.
--
-- FØRSTE KØRSEL: der er ingen rækker at sende før rådgiveren klikker
-- «tal med dem» på en ansøgning i fladen. Læs tørkørslen først:
--   SELECT public.kald_edge('ansoegning-rykker-cron');  -- tom body = tørkørsel
--   SELECT status_code, content::text FROM net._http_response ORDER BY id DESC LIMIT 1;
--
-- FØR-SQL: SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'ansoegning-rykker';
--   FACIT FØR: ingen rækker.
-- EFTER-SQL: samme — FACIT EFTER: 1 række, active = true, schedule '*/15 5-15 * * 1-5'.
--
-- ROLLBACK: SELECT cron.unschedule('ansoegning-rykker');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ansoegning-rykker') THEN
    PERFORM cron.unschedule('ansoegning-rykker');
  END IF;
END $$;

SELECT cron.schedule(
  'ansoegning-rykker',
  '*/15 5-15 * * 1-5',
  $job$ SELECT public.kald_edge('ansoegning-rykker-cron', '{"dry_run": false}'::jsonb, 30000, 900000) $job$
);

SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'ansoegning-rykker';
