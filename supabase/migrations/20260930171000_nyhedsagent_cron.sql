-- KØRT i prod 30/9-2026 ca. 20:30 via Lovable-MCP'en efter deploy og tørkørsel (kald 26694: 200, "nyhed_agent":"skive-1", 5 kilder 200, 17 nye, 7 relevante). cron.schedule gav jobid 576. Låsen nyhedsagent_aktiv er ikke sat (= false): intet udkast skrives.
-- KØRES FØRST EFTER UDRULNING OG TØRKØRSEL.
-- Venter. Manuelt i Lovable → SQL editor, EFTER 20260930170000_nyhedsagent.sql, den eksplicitte deploy af nyhed-agent-cron og en læst tørkørsel. (Linjen bærer bevidst ikke husets «kør efter merge»-markør: den, der scanner mappen efter den, må ikke køre denne sammen med de andre.)
--
-- RÆKKEFØLGEN (CLAUDE.md «Deployment af edge functions»): merge → 20260930170000 i SQL
-- editor → EKSPLICIT deploy af nyhed-agent-cron og nyhed-udkast-afgoer fra build-chat (bed
-- den KØRE deploy-værktøjet og vise resultatet) → tørkørsel i hånden, svaret læst →
-- låsen slået til → FØRST DA denne migration.
--
-- TØRKØRSLEN (body {} = tørkørsel; LLM'en kaldes, men intet skrives ud over sporet):
--   SELECT public.kald_edge('nyhed-agent-cron', '{}'::jsonb, 140000);
--   … og svaret: SELECT id, status_code, content FROM net._http_response ORDER BY id DESC LIMIT 1;
--   Beviset for, at den NYE kode kører: "nyhed_agent":"skive-1" i svaret. Læs «kilder»
--   (http 200 og emner > 0 pr. kilde), «vurderet», «udkast» (titel og punkter) og «llm»
--   (kald ≤ 4, tokens). En kilde med fejl står der med grunden.
--
-- JOBBET: mandag kl. 04:40 UTC = 06:40 dansk sommertid (CEST) og 05:40 dansk vintertid
-- (CET). Begge før kl. 07, så klokken «nyhed_udkast_klar» kommer med i mandagens
-- morgenmail fra klokke-mail-cron (MORGEN-listen: klokker fra FØR kl. 07).
-- Minut 40 rammer intet andet job på mandag kl. 04 UTC (målt i migrationerne 30/9:
-- ingen anden cron.schedule med «40 4»).
-- Timeout 140 000 ms: under kald_edge_loft_ms() (150 s) og = JOB_TIMEOUT_MS i
-- _shared/nyhedAgent.ts (ændres det ene, ændres det andet i samme PR). Interval én uge
-- (604 800 000 ms) — kald_edge afviser en timeout, der ikke er kortere.
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).

select cron.schedule(
  'nyhed-agent',
  '40 4 * * 1',
  $job$
  select public.kald_edge(
    'nyhed-agent-cron',
    '{"dry_run": false}'::jsonb,
    140000,      -- timeout: under kald_edge_loft_ms() (150 s); = JOB_TIMEOUT_MS
    604800000    -- jobbets interval (7 døgn)
  );
  $job$
);

-- EFTER (ét resultatsæt):
select 'job' as sektion, jobid::text as noegle, concat(jobname, ' | ', schedule, ' | active ', active) as vaerdi
  from cron.job where jobname = 'nyhed-agent';
-- FACIT EFTER: én række «nyhed-agent | 40 4 * * 1 | active true».
-- Revert: select cron.unschedule('nyhed-agent');
