-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- KØRES ALLERSIDST i skive 3 — efter 20261003010000 og 20261003030000, efter at
-- webinar-motor-cron er UDRULLET og har svaret med `motor: "boardroom-3"` på en
-- tørkørsel (docs/webinarmotor.md §7, trin 6). Et job mod en function, der ikke
-- er udrullet, giver 404 hvert femte minut.
--
-- LÅSEN GØR JOBBET UFARLIGT: uden app_config['webinar_motor_aktiv'] = true
-- dømmer cronen, men skriver INTET og sender intet til Klaviyo, uanset
-- dry_run: false i jobbet (svaret siger sender_rigtigt: false). Den interne
-- prøve kører UDEN låsen: et håndkald med session_id på en INTERN session.
--
-- SLOTTET: 1-59/5 (1, 6, 11, …, 56) — hvert femte minut. Minutterne deles med
-- klaviyo-gensend (samme serie); ingen af de minutter, som gaSend.guard,
-- metaSend.guard, klokkeMail.guard og klaviyoProfil.guard holder frie
-- (2,12,…; 3,8,…; 4,19,34,49; 17), bruges. Der findes ingen fri minutserie
-- (webinar-mail tog de sidste elleve, 20260922172000).
-- HVORFOR HVERT FEMTE MINUT OG IKKE HVERT MINUT (spec §D1): cronen dømmer kun
-- sessioner, der er slut + 5 min (FREMMOEDE_MARGIN_MS). Med fem minutter
-- mellem kørslerne kommer dommen 5–10 min efter exitrummets slut — Klaviyos
-- efter-flow er datostyret og mærker ikke forskellen.
-- TIMEOUT 60 s (under kald_edge_loft_ms() 150 s) og INTERVAL 300 000 ms —
-- kald_edge afviser en timeout, der ikke er kortere end intervallet.
-- Functionens budget (fremmoede.ts: SENESTE_START_MS = 42 000) er regnet mod
-- de 60 s; ændres timeouten her, ændres JOB_TIMEOUT_MS i samme PR.
--
-- FØR-SQL (ét resultatsæt):
--   select '1 jobbet' as sektion, coalesce(j.jobname, '(findes ikke)') as noegle,
--          coalesce(concat(j.schedule, ' · active=', j.active), '-') as vaerdi
--     from (select 1) x left join cron.job j on j.jobname = 'webinar-motor'
--   union all
--   select '2 laasen', 'webinar_motor_aktiv',
--          coalesce((select config_value::text from public.app_config where config_key = 'webinar_motor_aktiv'), 'ikke sat → false')
--   order by 1, 2;
--   FACIT FØR: sektion 1 «(findes ikke)»; sektion 2 «ikke sat → false».
--
-- Revert: SELECT cron.unschedule('webinar-motor');

SELECT cron.schedule(
  'webinar-motor',
  '1-59/5 * * * *',
  $job$
  SELECT public.kald_edge(
    'webinar-motor-cron',
    '{"dry_run": false}'::jsonb,
    60000,      -- timeout: under kald_edge_loft_ms() (150 s); functionens budget er 42 s + én tilmeldings værste forløb
    300000      -- jobbets interval (5 min) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);

-- EFTER-tjek (kør med det samme, bogfør svaret i dette filhoved):
select '1 jobbet' as sektion, j.jobname as noegle,
       concat(j.jobid, ' · ', j.schedule, ' · active=', j.active) as vaerdi
  from cron.job j where j.jobname = 'webinar-motor'
union all
select '2 laasen', 'webinar_motor_aktiv',
       coalesce((select config_value::text from public.app_config where config_key = 'webinar_motor_aktiv'), 'ikke sat → false')
 order by 1, 2;
