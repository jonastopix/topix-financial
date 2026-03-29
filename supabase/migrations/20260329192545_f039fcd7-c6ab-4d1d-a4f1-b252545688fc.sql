-- Schedule weekly focus generation every Monday at 06:00 UTC (08:00 Danish summer time)
-- Safe to run manually for testing: pass {"company_id": "uuid"} in body
-- To revert: SELECT cron.unschedule('generate-weekly-focus');

SELECT cron.schedule(
  'generate-weekly-focus',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/generate-weekly-focus',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);