-- Prod-cron bogført (2026-09-01): tre jobs kørte KUN i prod — ingen af
-- dem kunne genskabes fra repoet. Målt 1/9 ved at sammenholde cron.job
-- (ni jobs, alle aktive) med migrationshistorikken — første gang den
-- afstemning er lavet. Kommandoerne herunder er hentet fra prod og
-- kopieret TEGN FOR TEGN — ikke gættet, ikke forkortet, ikke forbedret.
--
-- process-notification-emails (jobid 8 i prod, */5): formentlig hele
-- mail-kædens ENESTE kørende planlægning. Oprydningen 10/8
-- (20260810230000) unschedulerede et send-notification-email-job på
-- */15 som "ren dublet af job 8, som virker" — job 8 er DENNE, og den
-- kalder samme funktion på */5. Prod kører altså tre gange oftere end
-- repoets version foreskrev, og det er prod-versionen der bogføres,
-- fordi det er den der virker. Forsvinder jobbet, holder al post op
-- med at komme ud. Målt 1/9: 692 mails afsendt, elleve i dead letter.
--
-- intro-session-reminder (jobid 249 i prod, 0 9): jobnavnet matcher
-- ikke funktionsnavnet (intro-reminder-cron). Det er grunden til at en
-- tidligere recon konkluderede at den aldrig havde kørt — navnet
-- fandtes ikke.
--
-- cleanup-stale-processing-reports (jobid 4 i prod, */5): funktionen
-- kom i migration 20260309114227 men blev aldrig scheduleret der. Den
-- sætter rapporter der har hængt i 'processing' over ti minutter til
-- 'error' — en fail-safe mod parsing-kørsler der dør undervejs.
--
-- Kørsel i dag unschedulerer og gen-schedulerer de tre, så deres jobid
-- ændrer sig. Det er harmløst, og det er prisen for at kommandoen
-- fremover kan genskabes.
--
-- DEPLOY: manuelt i Lovable -> SQL editor efter merge (CLAUDE.md —
-- migrationer auto-deployer aldrig). Verificér bagefter med et
-- cron.job-opslag på alle ni jobs:
--   SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY schedule, jobname;

-- ── 1. cleanup-stale-processing-reports ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-processing-reports') THEN
    PERFORM cron.unschedule('cleanup-stale-processing-reports');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-stale-processing-reports',
  '*/5 * * * *',
  $job$SELECT public.cleanup_stale_processing_reports();$job$
);

-- ── 2. process-notification-emails ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-notification-emails') THEN
    PERFORM cron.unschedule('process-notification-emails');
  END IF;
END $$;

SELECT cron.schedule(
  'process-notification-emails',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- ── 3. intro-session-reminder ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'intro-session-reminder') THEN
    PERFORM cron.unschedule('intro-session-reminder');
  END IF;
END $$;

SELECT cron.schedule(
  'intro-session-reminder',
  '0 9 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/intro-reminder-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{"dry_run": false}'::jsonb
  ) AS request_id;
  $job$
);

-- ── Efter-verifikation: de tre står aktive ──
SELECT jobid, jobname, schedule, active FROM cron.job
WHERE jobname IN ('cleanup-stale-processing-reports', 'process-notification-emails', 'intro-session-reminder')
ORDER BY jobname;
