-- Legatets Momentumkald-påmindelse (10/9-2026, de-tyve.md nr. 13).
--
-- legat-reminder-cron bestod alene af et Deno.cron-kald ('0 9 * * *'), og
-- Deno.cron kører ikke på Supabases runtime — funktionen har ALDRIG kørt, og
-- ingen legatmedlemmer har fået påmindelsen. Funktionen er nu en Bucket B-
-- cron (HTTP-indgang + authenticateServiceRole, tørkørsel som standard), og
-- dette job kalder den dagligt kl. 09:30 UTC gennem kald_edge (URL, vault-
-- nøgle og timeout ét sted). 09:30 er valgt fordi 09:00 allerede bærer
-- report-reminder og intro-session (målt 2/9); dagen er det der tæller.
--
-- Logikken i funktionen: aktive legat_enrollments uden booket Momentumkald,
-- mindst 2 dage efter start, én besked pr. samtale (findes message_type
-- 'legat-momentum-reminder' allerede, sendes aldrig igen). Første kørsel
-- rammer derfor ALLE aktive forløb ældre end 2 dage, der aldrig har fået
-- beskeden — det er meningen, men læs tørkørslen først.
--
-- SKREVET 10/9, IKKE KØRT. Deploy manuelt i Lovable → SQL editor efter merge
-- (CLAUDE.md — migrationer auto-deployer aldrig). FØR den køres: kald
-- funktionen i hånden UDEN body (tørkørsel) og læs svaret — feltet
-- ville_sende og listen kandidater skal give mening for de forløb der er
-- aktive:
--   SELECT public.kald_edge('legat-reminder-cron');  -- tom body = tørkørsel
--   SELECT status_code, content::text FROM net._http_response ORDER BY id DESC LIMIT 1;
--
-- Revert: SELECT cron.unschedule('legat-reminder-cron');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'legat-reminder-cron') THEN
    PERFORM cron.unschedule('legat-reminder-cron');
  END IF;
END $$;

SELECT cron.schedule(
  'legat-reminder-cron',
  '30 9 * * *',
  $job$ SELECT public.kald_edge('legat-reminder-cron', '{"dry_run": false}'::jsonb) $job$
);

-- Efter-verifikation:
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'legat-reminder-cron';
