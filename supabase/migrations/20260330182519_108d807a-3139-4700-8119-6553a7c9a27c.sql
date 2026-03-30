
-- Schedule monthly digest: 5th of every month at 08:00 UTC
select cron.schedule(
  'send-monthly-digest',
  '0 8 5 * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url' limit 1) || '/functions/v1/send-monthly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  )
  $$
);
