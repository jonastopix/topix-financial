-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- RÆKKEFØLGEN — LÆS DEN (CLAUDE.md «Deployment af edge functions»; stille-klokker-formen 20/9):
--   1. merge til main (kilden lander hos Lovable; den kører ikke)
--   2. EKSPLICIT deploy af klaviyo-gensend-cron fra Lovables build-chat — en NY function er
--      aldrig i drift, før dette er sket
--   3. tørkørsel:  SELECT public.kald_edge('klaviyo-gensend-cron');            -- body {} = tørkørsel
--      … og læs svaret på id'et i net._http_response:
--      SELECT status_code, left(content::text, 1200) FROM net._http_response ORDER BY id DESC LIMIT 1;
--      Svaret skal bære raekker_laest, grupper, gensend, opgivet, konfiguration, ignoreret,
--      alarm_grupper, alarm_mail = 'ingen' eller 'toerkoersel', gensendt = 0.
--   4. beviset — én ok-række sendt igen (en dublet, Klaviyo kasserer på unique_id; ingen får en mail).
--      KANDIDATEN SKAL VÆRE «Ansoegning sendt» eller «Ansoegning paabegyndt»: intet flow starter på de
--      to (recon-gensender-foer-bygning.md §4.1 — «Ansoegning sendt» bruges kun som betingelse,
--      «Ansoegning paabegyndt» udløser intet flow). PROEVE-rækkerne er «Deltog i webinar» /
--      «Moedte ikke op» på jonasherlev@hotmail.com, som passerer de live flows' filter (frisk = ja,
--      SUBSCRIBED, i Hovedliste) — en dublet, Klaviyo mod forventning IKKE kasserede, ville sende
--      flowets mails. Brug dem aldrig som bevis.
--      SELECT id, metric, unikt_id, email, sendt_at FROM public.klaviyo_haendelser
--       WHERE udfald = 'ok' AND metric IN ('Ansoegning sendt', 'Ansoegning paabegyndt')
--       ORDER BY sendt_at DESC LIMIT 3;
--      SELECT public.kald_edge('klaviyo-gensend-cron',
--        '{"dry_run": false, "bevis_id": "<id herfra>"}'::jsonb, 60000);
--      Svaret skal bære bevis: { id, udfald_foer: 'ok', udfald_nu: 'ok' } og lykkedes = 1 — og en NY
--      række i klaviyo_haendelser med samme unikt_id og udfald ok. Svarer den med noget andet, eller
--      med intet, er den ikke udrullet — uanset hvad «View code» viser.
--   5. FØRST derefter denne migration (cron-jobbet).
--
-- GENSENDEREN (21/9-2026, ~/Downloads/recon-klaviyo-gensend.md + recon-gensender-foer-bygning.md):
-- en Klaviyo-hændelse, der fejlede (timeout, 5xx, 429, nøgle), var tabt for altid — sporet
-- klaviyo_haendelser vidste det, ingen gensendte, og delindekset klaviyo_haendelser_udfald_idx var
-- bygget til en gensender, der ikke fandtes. Tirsdag 22/9 kl. 09 POSTer eWebinar for ~300 på få
-- minutter. Dommen bor i _shared/klaviyoGensend.ts (ren, én prøve pr. regel): grupperet på
-- (metric, email, unikt_id); én ok-række afslutter gruppen; gensendes = timeout·fejl·loft·
-- ingen_noegle·noegle_afvist; opgives = ugyldig; ignoreres = ingen_mail/ikke_sendt; kun grupper
-- med første forsøg under 24 t; afstand 5·2^(forsøg−1) min (5+10+20+40+80 = 155 min); højst 6 forsøg.
-- Alarm (mail til raadgiverModtager + drift-klokke, højst én pr. time) ved opgivet og ved nøglefejl.
--
-- Ingen tabel, ingen kolonne: hvert forsøg er en NY række i klaviyo_haendelser (ingen unikhedsregel,
-- klaviyo.guard dom 6), alarmen er email_send_log + advisor_notifications.
--
-- SLOTTET: hvert 5. minut på OFFSET 1 — minutterne 1, 6, 11, …, 56. Målt 21/9 mod alle
-- cron.schedule i migrationerne (29 forekomster, 28 udtryk + 1 udkommenteret gentagelse):
--   */5  * * * *      × 2  (cleanup-stale-processing-reports, process-notification-emails)
--   */15 * * * *      × 3  og  */15 5-15 * * 1-5  × 1
--   faste minutter:   0 (mange), 5 (agentforslag-udloeb), 7 (vagt-cron, hver time), 10 (opgave-forfald),
--                     15 (onboarding-rytme), 20 (report-review), 30 (stille-klokker, legat), 33 (meta ×2)
--   Alle multipla af 5 er taget af */5. Offset 2 rammer :07 (vagt-cron) og offset 3 rammer :33
--   (meta-annoncer 03:33, meta-hentning-vagt 04:33). Offset 1 og 4 er fri; 1 er valgt, så den
--   første gensendelse ligger 5–10 min efter fejlen.
-- TIMEOUT 60 s (under kald_edge_loft_ms() 150 s) og INTERVAL 300 000 ms (5 min) — kald_edge
-- afviser en timeout, der ikke er kortere end intervallet. Functionens eget budget er 45 s.
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).

SELECT cron.schedule(
  'klaviyo-gensend',
  '1-59/5 * * * *',
  $job$
  SELECT public.kald_edge(
    'klaviyo-gensend-cron',
    '{"dry_run": false}'::jsonb,
    60000,       -- timeout: under kald_edge_loft_ms() (150 s); functionens eget budget er 45 s
    300000       -- jobbets interval (5 min) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);

-- Efter-verifikation (kør med det samme, bogfør svaret i dette filhoved):
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'klaviyo-gensend';
--   -- Første kørsel inden for 5 min: svaret på det nyeste id i net._http_response, og
--   SELECT status_code, left(content::text, 600) FROM net._http_response ORDER BY id DESC LIMIT 1;
--   -- Efter webinaret 22/9: gensendelserne står som nye rækker i sporet —
--   SELECT metric, unikt_id, udfald, sendt_at FROM public.klaviyo_haendelser
--    WHERE sendt_at > now() - interval '1 day' ORDER BY unikt_id, sendt_at;
--   -- og alarmen, hvis den ringede:
--   SELECT created_at, recipient_email, status FROM public.email_send_log
--    WHERE template_name = 'klaviyo-gensend-alarm' ORDER BY created_at DESC LIMIT 5;
-- Revert: SELECT cron.unschedule('klaviyo-gensend');
