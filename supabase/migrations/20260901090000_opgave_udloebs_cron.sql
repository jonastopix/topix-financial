-- Migration: opgave-modellens udløbs-cron (B8 i docs/opgave-model-design.md
-- — besluttet 2026-08-22; bygget 2026-09-01): 'proposed' -> 'expired' når
-- expires_at passerer. Udløb er tavshedens udfald — ikke et nej
-- (dismissed) og ikke et valg (dropped); rækken bliver i data og fodrer
-- tilstandslaget i fase 2 ("tælles for rådgiveren").
--
-- Målt i prod 1/9: 72 forslag venter i tre bølger — 34 den 7/9 hos 13
-- virksomheder, 3 den 10/9, 35 den 14/9. Nul allerede passeret, så første
-- kørsel lukker ingen pukkel.
--
-- REN SQL-CRON, IKKE EDGE FUNCTION (beslutning 1/9): erUdloebet
-- (src/lib/opgaveEngine.ts:190-192) er tre betingelser — status er
-- 'proposed', expires_at findes, og nu er efter tidspunktet. Det er ikke
-- en regel man kan implementere forkert; det er den samme sætning på to
-- sprog. Edge-vejen er derimod fem fejlkilder: URL, vault-nøgle,
-- verify_jwt, deploy — og en ny funktion der ikke auto-deployer, målt
-- 31/8 med foreslaa-opgave, der svarede 404 efter merge. Præcedensen er
-- 20260825233000_agent_runs_opbevaring.sql, husets første rene SQL-cron,
-- bygget netop for at undgå de fejlkilder. Pariteten mellem SQL-prædikatet
-- og motoren låses af src/lib/__tests__/opgaveUdloebsCron.paritet.test.ts,
-- som læser DENNE fil — driver de to fra hinanden, fejler testen.
--
-- Prædikatet spejler erUdloebet ORDRET (tidsstempel-dom, ikke kalenderdag;
-- skarpt <, ikke <=: udløb indtræffer først EFTER tidspunktet — motoren
-- siger nu.getTime() > expires_at.getTime(), samme grænse fra den anden
-- side):
--   status = 'proposed' AND expires_at IS NOT NULL AND expires_at < now()
-- SET'et spejler luk()'s stempel (opgaveEngine.ts:175-180): status =
-- 'expired' OG closed_at = now() — closed_at er sluttilstandens felt
-- uanset udfald (design §7). proposed -> expired er en lovlig
-- motorovergang (OVERGANGE i opgaveEngine.ts:84-97).
--
-- RLS blokerer ikke: pg_cron kører body'en som postgres (tabelejeren),
-- og RLS gælder ikke ejeren — company_actions' service-role-only-
-- skrivepolitik (20260822224100) er derfor ikke i vejen.
--
-- Slot 04:00 UTC: ledigt (kortlagt 1/9 over cron.schedule i hele
-- migrationshistorikken: 05:00 agent-runs-opbevaring, 06:00
-- generate-weekly-focus (mandag), 07:00 event-reminders, 08:00
-- send-pulse-reminder (d. 10.) / send-monthly-digest (d. 22.), 09:00
-- daily-report-reminder + daily-reflection-nudge — dertil de lette
-- email-jobs hvert kvarter/5. sekund). 04:00 ligger FØR alle dagens
-- medlemsvendte jobs, så nattens udløb er lukket inden weekly-focus
-- (mandag 06:00) skriver nye forslag.
--
-- BEVIS uden at vente — SELECT-modstykke med ORDRET samme WHERE som
-- job-body'en (kør før/efter første kørsel; 1/9 = 0 rækker):
--
--   SELECT id, company_id, source_type, expires_at
--   FROM public.company_actions
--   WHERE status = 'proposed'
--     AND expires_at IS NOT NULL
--     AND expires_at < now()
--   ORDER BY expires_at;
--
-- Indekset idx_company_actions_expiry (20260822220000, partielt på
-- expires_at hvor status = 'proposed') blev lagt til netop dette job.
--
-- Revert: SELECT cron.unschedule('opgave-udloeb');
--   Allerede-lukkede rækker genåbnes ikke automatisk — expired er en
--   sluttilstand, og en genåbning ville være en ny beslutning.
--
-- DEPLOY: manuelt i Lovable -> SQL editor efter merge (CLAUDE.md —
-- migrationer auto-deployer aldrig). Verificér med cron.job-SELECT'en
-- nederst + bevis-SELECT'en ovenfor.

-- ── 1. Idempotent unschedule-værn (genkørsel af migrationen er ufarlig) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'opgave-udloeb') THEN
    PERFORM cron.unschedule('opgave-udloeb');
  END IF;
END $$;

-- ── 2. Jobbet ──
SELECT cron.schedule(
  'opgave-udloeb',
  '0 4 * * *',
  $job$
  UPDATE public.company_actions
  SET status = 'expired',
      closed_at = now()
  WHERE status = 'proposed'
    AND expires_at IS NOT NULL
    AND expires_at < now();
  $job$
);

-- ── 3. Efter-verifikation: jobbet står aktivt ──
SELECT jobid, jobname, schedule, active FROM cron.job
WHERE jobname = 'opgave-udloeb';
