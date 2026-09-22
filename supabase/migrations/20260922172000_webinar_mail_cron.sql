-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- KØRES ALLERSIDST — efter 20260922170000, 20260922171000, efter at
-- webinar-mail-cron og webinar-afmeld er UDRULLET, og efter at prøven (én mail
-- af hver art til jonas@topix.dk) er set i indbakken. Et cron-job, der kører
-- før prøven, sender rigtige mails til rigtige mennesker, uden at nogen har
-- set en af dem.
--
-- LÅSEN GØR DET ALLIGEVEL UFARLIGT — men rækkefølgen står her, fordi en lås,
-- man glemmer at have sat, ikke er en lås. Uden app_config['webinar_mail_aktiv']
-- = true sender cronen INTET, uanset dry_run: false i jobbet.
--
-- SLOTTET: 9, 14, 24, 27, 29, 37, 39, 44, 47, 57, 59 — ELLEVE kørsler i timen,
-- og det er PRÆCIS de minutter, der er tilbage. Målt 22/9 aften med husets egen
-- `kolliderer()` (klokkeMail.guard / metaSend.guard) mod alle cron.schedule i
-- migrationerne — de frie minutter er nøjagtig den liste, og ikke ét mere:
--   */5 × 2        0,5,10,…,55   (cleanup-stale-processing-reports, process-notification-emails)
--   1-59/5         1,6,11,…,56   (klaviyo-gensend)
--   2,12,22,32,42,54             (ga-send)
--   3,8,13,…,58                  (meta-send)
--   4-59/15        4,19,34,49    (klokke-mail, #1091 — job 572, i drift 22/9)
--   */15 × 3 + */15 5-15 * * 1-5 0,15,30,45
--   faste:         7 (vagt-cron), 17 (klaviyo-profil), 20, 30, 33, 52
--
-- DET FØRSTE VALG VAR FORKERT. Udkastet havde 4,9,14,…,59 — og 4, 19, 34, 49 er
-- klokke-mailens siden #1091. Det fandt værnet, ikke jeg.
--
-- DERFOR EN LISTE OG IKKE «*/5»: der findes ikke længere en fri femminutters-
-- serie. Samme form som meta-send og ga-send, der begge er lister med huller.
-- Det største hul er ti minutter (14→24, 47→57, 59→9).
-- TIMEOUT 60 s (under kald_edge_loft_ms() 150 s) og INTERVAL 300 000 ms (5 min)
-- — kald_edge afviser en timeout, der ikke er kortere end intervallet.
-- Functionens eget budget er 45 s; det, der ikke nås, hedder «udsat» i svaret
-- og tages om fem minutter.
--
-- HVORFOR SÅ TÆT OG IKKE HVER TIME: «om en time»-mailen skal gå 60 minutter
-- før start. Med et timesinterval ville den ramme et sted mellem 60 og 120
-- minutter før — og nåden for en forsinket mail er to timer, så den ville
-- stadig blive sendt, bare på det forkerte tidspunkt. Med det største hul på
-- ti minutter går den mellem 50 og 60 minutter før.
--
-- FØR-SQL (ét resultatsæt):
--   select '1 jobbet' as sektion, coalesce(j.jobname, '(findes ikke)') as noegle,
--          coalesce(concat(j.schedule, ' · active=', j.active), '-') as vaerdi
--     from (select 1) x left join cron.job j on j.jobname = 'webinar-mail'
--   union all
--   select '2 laasen', 'webinar_mail_aktiv',
--          coalesce((select config_value::text from public.app_config where config_key = 'webinar_mail_aktiv'), 'ikke sat → false')
--   union all
--   select '3 sporet', 'raekker i webinar_mails', count(*)::text from public.webinar_mails
--   order by 1, 2;
--   FACIT FØR: sektion 1 «(findes ikke)»; sektion 3 = prøvens rækker (5 hvis
--   prøven er kørt), alle med udfald ok.
--
-- Revert: SELECT cron.unschedule('webinar-mail');

SELECT cron.schedule(
  'webinar-mail',
  '9,14,24,27,29,37,39,44,47,57,59 * * * *',
  $job$
  SELECT public.kald_edge(
    'webinar-mail-cron',
    '{"dry_run": false}'::jsonb,
    60000,      -- timeout: under kald_edge_loft_ms() (150 s); functionens eget budget er 45 s
    300000      -- jobbets interval (5 min) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);

-- EFTER-tjek (kør med det samme, bogfør svaret i dette filhoved):
select '1 jobbet' as sektion, j.jobname as noegle,
       concat(j.jobid, ' · ', j.schedule, ' · active=', j.active) as vaerdi
  from cron.job j where j.jobname = 'webinar-mail'
union all
select '2 laasen', 'webinar_mail_aktiv',
       coalesce((select config_value::text from public.app_config where config_key = 'webinar_mail_aktiv'), 'ikke sat → false')
 order by 1, 2;
