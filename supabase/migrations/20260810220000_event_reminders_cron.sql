-- Daglig cron for event-påmindelser (event-reminders, PR #263).
--
-- VIGTIGT: AKTIVERES IKKE af migrationen alene — cron-migrationer køres i
-- dette projekt MANUELT i Lovable -> SQL editor (samme disciplin som
-- daily-reflection-nudge, 20260611150000). TØRKØR FØRST: kald funktionen
-- manuelt én gang (http_post-sætningen nedenfor kan køres alene) og se
-- window_a/window_b-tællene i function-loggen, før selve cron.schedule
-- køres. Funktionen sender MAILS (priority important → send-notification-
-- email) til op mod tredive medlemmer pr. event i uge-vinduet — en fejl
-- her støjer i alles indbakke.
--
-- Genkørsel er HARMLØS: dedup_key (event_reminder:{event_id}:{a|b}, unik
-- pr. user_id via notifications-constrainten) gør funktionen idempotent —
-- tørkørslen "bruger" altså dagens beskeder, og cron-kørslen bagefter
-- sender kun til dem, der ikke allerede har fået.
--
-- Tidspunkt: '0 7 * * *' = 07:00 UTC = 09:00 dansk SOMMERTID (CEST),
-- 08:00 om vinteren (CET). pg_cron kører i UTC; forskydningen er
-- acceptabel for en påmindelse, og vinduerne er kalenderdage i
-- Europe/Copenhagen inde i funktionen og påvirkes ikke.
-- Slot-valget: 06:00 UTC blev FRAVALGT — generate-weekly-focus kører
-- der om mandagen ('0 6 * * 1') og er en tung AI-funktion der rammer
-- alle virksomheder. 09:00 UTC blev også fravalgt — den bærer allerede
-- to jobs (daily-reflection-nudge og daily-report-reminder). 07:00 UTC
-- er helt ledigt.
--
-- Vault-secrets-mønstret fra daily-report-reminder (20260327094748).
-- To revert: SELECT cron.unschedule('daily-event-reminders');

SELECT cron.schedule(
  'daily-event-reminders',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/event-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
