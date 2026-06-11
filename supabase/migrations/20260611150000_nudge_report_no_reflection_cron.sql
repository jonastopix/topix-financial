-- Daglig cron for auto-nudgen om manglende refleksion (nudge-report-no-reflection).
--
-- VIGTIGT: AKTIVÉR FOERST MANUELT. Denne fil er kanonisk historik + klar-til-koersel.
-- Ligesom RLS-migrationer koeres cron-migrationer i dette projekt manuelt i Lovable ->
-- SQL editor. Vi committer filen nu, men koerer den FOERST naar vi har set en sidste
-- ren toerkoersel give praecis de forventede kandidater. Indtil da er der INGEN cron,
-- og funktionen kan kun rammes manuelt (og svarer i toerkoersel uden body).
--
-- Hvad den goer naar den aktiveres: kalder funktionen dagligt 09:00 UTC (11:00 dansk
-- sommertid) med body { "dry_run": false }, dvs. LIVE. Funktionen self-gater paa alle
-- sine betingelser (seneste periode pr. virksomhed inden for 2 maaneder, committet >3
-- dage siden, ingen refleksion, tildelt advisor, ikke allerede sendt), saa daglig
-- koersel er sikker og idempotent. Vault-secrets-variant, samme moenster som
-- daily-report-reminder (migration 20260327094748).
--
-- To revert: SELECT cron.unschedule('daily-reflection-nudge');

SELECT cron.schedule(
  'daily-reflection-nudge',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/nudge-report-no-reflection',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{"dry_run": false}'::jsonb
  ) AS request_id;
  $$
);
