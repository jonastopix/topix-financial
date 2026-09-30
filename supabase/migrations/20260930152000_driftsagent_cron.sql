-- KØRES FØRST EFTER UDRULNING OG TØRKØRSEL — IKKE i en samlet kørsel
-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- FØRSTE LINJE ER MED VILJE EN ANDEN end husets «IKKE KØRT»-linje (teknisk råd
-- 30/9 fund 9): den, der scanner mappen efter første linje «IKKE KØRT» og kører
-- det fundne i én omgang, må IKKE få dette job med — et cron-job mod en function,
-- der ikke er udrullet, svarer 404 hvert kvarter. Rækkefølgen står i
-- docs/OVERLEVERING.md DEL 3 «Driftsagenten, skive 1 — rækkefølgen».
--
-- KØRES ALLERSIDST — efter 20260930150000 og 20260930151000 (grønt lys), efter at
-- drift-agent-cron er UDRULLET eksplicit fra build-chat, og efter at en
-- tørkørsel i hånden har svaret med "drift_agent":"skive-1", «tal.jobs» > 0 og
-- «laesefejl» tom:
--   SELECT public.kald_edge('drift-agent-cron', '{}'::jsonb, 60000);
--   SELECT id, status_code, left(content, 3000) FROM net._http_response ORDER BY id DESC LIMIT 1;
--
-- JOBBET KALDER MED dry_run: false FRA FØRSTE DAG. Det er valgt: en rigtig kørsel
-- LOGGER sig i drift_agent_koersler (agentens hjerteslag — vagt for sig selv) og
-- noterer jobs i drift_agent_jobs, men den MAILER KUN, når låsen
-- app_config['driftsagent_aktiv'] = true. Låsen står false (20260930150000).
-- Så agenten dømmer og logger i drift, før den må skrive til nogen — samme
-- adskillelse som meta_send_aktiv og webinar_mail_aktiv.
--
-- SLOTTET 10, 25, 40, 55 (hvert 15. min, UTC = samme minutter dansk). Der er
-- intet frit minut tilbage i timen (målt i 20260922172000's hoved). Valgt:
--   * IKKE 4/19/34/49 (klokke-mail), 3/8/…/58 (meta-send), 2/12/22/32/42/54
--     (ga-send), 9/14/24/27/29/37/39/44/47/57/59 (webinar-mail), 17 (klaviyo-profil):
--     de fire værn (klokkeMail, metaSend, gaSend, webinarMail, klaviyoProfil) dømmer
--     deres egne minutter mod ALLE planer.
--   * 10/25/40/55 deler minut med */5 (cleanup-stale-processing-reports, ren SQL,
--     og process-notification-emails). Det koster kun tilskrivningen af svar til
--     jobs (driftDom.tilskrivSvar): agentens egne svar bærer markøren
--     «drift_agent» og tilskrives altid dens eget job; tvetydige står i tal.
--   * :10 ligger tre minutter efter vagt-cron (:07), så agenten ser vagtens
--     ferske række.
-- TIMEOUT 60 s (under kald_edge_loft_ms() 150 s) og INTERVAL 900 000 ms (15 min)
-- — kald_edge afviser en timeout, der ikke er kortere end intervallet.
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).
--
-- FØR-SQL:
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'drift-agent';
--   FACIT FØR: ingen række.
-- EFTER-SQL (kør med det samme, bogfør svaret i dette filhoved):
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'drift-agent';
--   FACIT EFTER: én række · 10,25,40,55 * * * * · active true.
--   Første kørsel: SELECT tid, alvor, roede, gule, aftryk, alarm_valg FROM public.drift_agent_koersler ORDER BY tid DESC LIMIT 3;
-- Revert: SELECT cron.unschedule('drift-agent');

SELECT cron.schedule(
  'drift-agent',
  '10,25,40,55 * * * *',
  $job$
  SELECT public.kald_edge(
    'drift-agent-cron',
    '{"dry_run": false}'::jsonb,
    60000,       -- timeout: under kald_edge_loft_ms() (150 s)
    900000       -- jobbets interval (15 min) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);
