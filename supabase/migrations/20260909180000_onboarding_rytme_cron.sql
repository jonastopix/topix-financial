-- Onboardingens rytme (9/9): planlægger cron-jobbet 'onboarding-rytme', som
-- kalder edge-funktionen onboarding-rytme dagligt kl. 09:15 UTC — mail A
-- «Sådan kommer du i gang» (dag 0–1) og mail C «Historikken først» (dag
-- 14–20) til nye medlemmer. Mail B (dag 10) sendes af det eksisterende job
-- intro-session-reminder (intro-reminder-cron), som er ændret i kode fra dag
-- 2 til dag 10 — det job rører denne migration ikke.
--
-- SKREVET 9/9, IKKE KØRT. Deploy manuelt i Lovable → SQL editor efter merge
-- (CLAUDE.md — migrationer auto-deployer aldrig). FØR den køres: kald
-- funktionen i hånden UDEN body (tørkørsel) og læs svaret — feltet
-- ville_sende skal være 0 eller kun dække medlemmer der kom ind i går/i
-- dag. Sikringen mod at ramme de 25 gamle medlemmer ligger i motoren
-- (src/lib/onboardingRytme.ts: A kun dag 0–1), så et live-job er sikkert
-- fra første kørsel — men læs tørkørslen alligevel.
--
-- Slottet 09:15 er ledigt (målt 2/9: 04:00 opgave-udløb, 05:00 agent-runs,
-- 06:00 weekly-focus, 07:00 event-reminders, 08:00 pulse/digest, 09:00
-- report-reminder + intro-session, 10:00 indgangs-paamindelser).
-- Samme form som intro-session-reminder (20260901112000) og vault-nøglen
-- email_queue_service_role_key, som de øvrige jobs.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'onboarding-rytme') THEN
    PERFORM cron.unschedule('onboarding-rytme');
  END IF;
END $$;

SELECT cron.schedule(
  'onboarding-rytme',
  '15 9 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/onboarding-rytme',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{"dry_run": false}'::jsonb
  ) AS request_id;
  $job$
);

-- Efter-verifikation:
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'onboarding-rytme';
