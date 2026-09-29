-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- RÆKKEFØLGEN — LÆS DEN (CLAUDE.md «Deployment af edge functions»):
--   1. merge til main (kilden lander hos Lovable; den kører ikke)
--   2. EKSPLICIT deploy af statusmail-cron fra Lovables build-chat — bed den KØRE
--      deploy-værktøjet og vise resultatet
--   3. tørkørsel MED TAL: SELECT public.kald_edge('statusmail-cron', '{"nu": "<næste mandag>T06:00:00Z"}'::jsonb, 60000);
--      og svaret i net._http_response: vindue true, uge, pr_maerke, modtagere (allerede),
--      emne og tekst — LÆS mailen, før den sendes. En tørkørsel uden «nu» uden for
--      vinduet svarer vindue false og henter intet — det er beviset for udrulningen
--      (feltet «vindue» findes kun i den nye kode).
--   4. første rigtige kørsel i hånden en mandag efter kl. 7 dansk:
--      SELECT public.kald_edge('statusmail-cron', '{"dry_run": false}'::jsonb, 60000);
--   5. FØRST derefter denne migration (cron-jobbet).
--
-- STATUSMAILEN (trin 2, 29/9-2026): den ugentlige mail til rådgiverne med
-- medlemsoverblikket — mandag kl. 7 DANSK tid (besluttet 29/9), til user_roles
-- advisor/admin. pg_cron kører i UTC og kan ikke udtrykke «kl. 7 dansk» året rundt,
-- så jobbet kører TO gange, og functionen dømmer vinduet (statusMail.ts
-- erStatusmailVindue — samme mekanisme som klokke-mail-cronens morgenmail):
--   05:33 UTC = 07:33 dansk om SOMMEREN (CEST) → sender; om vinteren 06:33 → uden_for_vindue
--   06:33 UTC = 07:33 dansk om VINTEREN (CET)  → sender; om sommeren 08:33 → nøglen fandtes
-- Mailen går derfor kl. 07:33 dansk sommer som vinter; nøglen (én pr. rådgiver pr.
-- ISO-uge i email_send_log) er dørstopperen for den anden kørsel.
--
-- SLOTTET: minut 33 i timerne 5 og 6 UTC, kun mandag. Målt 29/9 mod alle cron.schedule
-- i migrationerne (statusmailCron.guard regner det): minut 33 bruges kun af meta-annoncer
-- (03:33) og meta-hentning-vagt (04:33) — ikke i timerne 5 og 6; ingen af timelisterne
-- (*/5, */15, 1-59/5, meta-send, ga-send, webinar-mail, klokke-mail, vagt :07, profil :17)
-- indeholder 33. TIMEOUT 60 s (under kald_edge_loft_ms() 150 s) og INTERVAL 3 600 000 ms
-- (en time mellem de to kørsler) — kald_edge afviser en timeout, der ikke er kortere.
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).
--
-- FØR-SQL (ét resultatsæt):
--   SELECT '1 jobbet' AS sektion, coalesce(j.jobname, '(findes ikke)') AS noegle,
--          coalesce(concat(j.schedule, ' · active=', j.active), '-') AS vaerdi
--     FROM (SELECT 1) x LEFT JOIN cron.job j ON j.jobname = 'statusmail'
--   UNION ALL
--   SELECT '2 mails', 'statusmail i email_send_log', count(*)::text FROM public.email_send_log WHERE template_name = 'statusmail'
--   ORDER BY 1, 2;
--   FACIT FØR: sektion 1 «(findes ikke)»; sektion 2 = antal håndkørsler (0 eller 2).

SELECT cron.schedule(
  'statusmail',
  '33 5,6 * * 1',
  $job$
  SELECT public.kald_edge(
    'statusmail-cron',
    '{"dry_run": false}'::jsonb,
    60000,       -- timeout: under kald_edge_loft_ms() (150 s)
    3600000      -- interval mellem de to mandagskørsler (1 time) — kald_edge afviser en timeout, der ikke er kortere
  );
  $job$
);

-- EFTER-tjek (kør med det samme, bogfør svaret i dette filhoved):
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'statusmail';
--   -- Første mandag: svaret på det nyeste id i net._http_response, og
--   SELECT status_code, left(content::text, 800) FROM net._http_response ORDER BY id DESC LIMIT 1;
--   -- Mailene:
--   SELECT created_at, template_name, recipient_email, status, message_id FROM public.email_send_log
--    WHERE template_name = 'statusmail' ORDER BY created_at DESC LIMIT 10;
-- ROLLBACK: SELECT cron.unschedule('statusmail');
