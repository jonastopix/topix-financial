-- Cron-oprydning 2026-08-10.
--
-- FØR-tal (SELECT-før kørt separat): 9 jobs, alle active.
--
-- Tre jobs afvikles:
--   1  daily-circle-sync        funktionen sync-circle findes ikke i
--                               repoet, og jobbet sender anon-nøglen.
--                               Circle forlades.
--  12  weekly-engagement-nudge  funktionen send-engagement-nudge er
--                               pensioneret. Jobbet slår desuden
--                               'supabase_url' op i vault, som ikke
--                               findes, og har derfor aldrig kørt.
--  22  send-notification-email  ren dublet af job 8, som virker.
--                               Samme vault-URL-fejl.
--
-- To jobs får hårdkodet URL. Vault indeholder KUN
-- email_queue_service_role_key — 'supabase_url' findes ikke, så
-- opslaget gav NULL og fejlede på http_request_queue.url.
--
-- Månedsbrevet flyttes fra dag 5 til dag 22: den 5. er rapporterne
-- for måneden endnu ikke kommet ind (påmindelser dag 7/15/20), så
-- brevet rapporterede om tal, der ikke fandtes.
--
-- Event-påmindelser aktiveres kl. 07:00 UTC. pg_cron kører i UTC:
-- det er 09:00 dansk sommertid (CEST) og 08:00 om vinteren (CET).
-- Vinduerne inde i funktionen er kalenderdage i Europe/Copenhagen og
-- påvirkes ikke af forskydningen.
--
-- Slot-valget er truffet, ikke tilfældigt: 06:00 UTC blev fravalgt,
-- fordi generate-weekly-focus ligger der om mandagen ('0 6 * * 1') og
-- er en tung AI-funktion, der rammer alle virksomheder. 09:00 UTC
-- blev fravalgt, fordi det allerede bærer daily-report-reminder og
-- daily-reflection-nudge. 07:00 UTC er helt ledigt.
--
-- Genkørsel af event-reminders er HARMLØS: dedup_key
-- (event_reminder:{event_id}:{a|b}, unik pr. user_id via
-- notifications-constrainten) gør funktionen idempotent. En manuel
-- kørsel "bruger" dagens beskeder, og cron-kørslen bagefter sender
-- kun til dem, der ikke allerede har fået.
--
-- Revert: SELECT cron.unschedule('event-reminders');

-- 1) Afvikl de tre døde jobs. Idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-circle-sync') THEN
    PERFORM cron.unschedule('daily-circle-sync');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-engagement-nudge') THEN
    PERFORM cron.unschedule('weekly-engagement-nudge');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-notification-email') THEN
    PERFORM cron.unschedule('send-notification-email');
  END IF;
END $$;

-- 2) Refleksions-nudge: hårdkodet URL. Uændret tid og body.
SELECT cron.schedule(
  'daily-reflection-nudge',
  '0 9 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/nudge-report-no-reflection',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{"dry_run": false}'::jsonb
  ) AS request_id;
  $job$
);

-- 3) Månedsbrev: hårdkodet URL, flyttet fra dag 5 til dag 22.
SELECT cron.schedule(
  'send-monthly-digest',
  '0 8 22 * *',
  $job$
  SELECT net.http_post(
    url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/send-monthly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $job$
);

-- 4) Event-påmindelser aktiveres.
SELECT cron.schedule(
  'event-reminders',
  '0 7 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/event-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $job$
);

-- 5) EFTER-tal. Forventet: 7 jobs, alle active, ingen vault-URL-opslag.
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
