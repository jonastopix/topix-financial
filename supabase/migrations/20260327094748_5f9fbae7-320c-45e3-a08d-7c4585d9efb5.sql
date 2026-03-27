-- Schedule daily report reminder at 09:00 UTC (11:00 Danish summer time)
-- The function self-gates: only sends on days 7, 15, and 20 of the month
-- Safe to run daily — non-reminder days return immediately with {skipped}
-- Uses vault-stored service_role key, same pattern as process-email-queue cron
-- To revert: SELECT cron.unschedule('daily-report-reminder');

SELECT cron.schedule(
  'daily-report-reminder',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/send-report-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);