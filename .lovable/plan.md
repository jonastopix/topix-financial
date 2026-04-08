

## Problem

`send-report-reminder` er aldrig blevet kaldt. Der er nul edge function logs og nul rækker i `email_send_log` med `template_name = 'report-reminder'`.

**Årsag:** `daily-report-reminder` cron-jobbet konstruerer URL'en via `vault.decrypted_secrets WHERE name = 'supabase_url'`, men den secret eksisterer ikke. Resultatet er `net.http_post(url := NULL)` som fejler stille.

Derudover er der to gamle cron-jobs (`report-reminder-10th` og `report-reminder-20th`) med forkert dag-mapping og muligvis også manglende auth-setting.

## Løsning

### 1. Fix `daily-report-reminder` cron-jobbet

Opdater jobbet til at bruge den hardkodede Supabase URL (som de andre cron-jobs gør) i stedet for en vault secret der ikke eksisterer. Alternativt: tilføj `supabase_url` til vault — men da vi allerede kender URL'en, er det enkleste at hardkode den som i de andre jobs.

**Nyt cron-job SQL:**
```sql
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'daily-report-reminder'),
  schedule := '0 9 * * *',
  command := $$
    SELECT net.http_post(
      url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/send-report-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

### 2. Fjern de to gamle, overflødige cron-jobs

`report-reminder-10th` og `report-reminder-20th` er forældede — `daily-report-reminder` dækker alle dage, og edge-funktionens day gate (`REMINDER_DAYS = [7, 15, 20]`) håndterer logikken.

```sql
SELECT cron.unschedule('report-reminder-10th');
SELECT cron.unschedule('report-reminder-20th');
```

### 3. Ingen kodeændringer nødvendige

Edge function-koden er korrekt: den tjekker `REMINDER_DAYS = [7, 15, 20]`, sætter urgency baseret på dag, og sender til members der mangler committed facts for forrige måned. Problemet er udelukkende at cron-jobbet aldrig kalder den.

