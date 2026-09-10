-- Migration: agentforslagenes udløbs-cron — 'proposed' -> 'expired' når
-- forslagets ISO-uge er passeret. Skemaets egen kommentar (20260825200000):
-- «expired (cron-dom, ikke bygget endnu)». Bygget 11/9 2026 (de-tyve nr. 4).
--
-- Målt i recon 10/9 (recon-opgaver-chat-tjekliste.md §1b): 63 rækker står
-- som proposed; forsiden og virksomhedssiden tæller ALLEREDE kun de
-- ISO-uge-gyldige i kode (erForslagGyldigt, besluttet 7/9), så denne cron
-- ændrer RÆKKERNE og panelets badge-kilde — ikke forsidens tal.
--
-- DOMMEN er ikke et tidsstempel men ISO-ugen (src/lib/forslagUdloeb.ts,
-- spejlet i _shared/forslagUdloeb.ts, besluttet 7/9): gyldigt ⇔
-- getISOWeekKey(proposed_at) === getISOWeekKey(nu). Alt andet er udløbet —
-- også et ulæseligt eller fremtidigt stempel (fail-closed, <> ikke <).
-- Postgres' modstykke til nøglen «YYYY-WNN» er to_char(ts, 'IYYY-"W"IW')
-- (ISO-år + ISO-uge). Der er INGEN expires_at på agent_proposals.
--
-- REN SQL-CRON, IKKE EDGE FUNCTION — samme beslutning som opgave-udloeb
-- (20260901090000, 1/9): prædikatet er den samme sætning på to sprog, og
-- edge-vejen er fem fejlkilder. forslagUdloeb.ts' filhoved kræver at en
-- cron «SKAL bruge denne funktion» — det kan SQL ikke, så pariteten låses i
-- stedet af src/lib/__tests__/agentforslagUdloebsCron.paritet.test.ts, som
-- læser DENNE fil og dømmer grænsen fra begge sider i motoren.
--
-- TIDSZONE: getISOWeekKey læser LOKALE datokomponenter — browseren i dansk
-- tid, Deno i UTC. Her vælges DANSK tid (AT TIME ZONE 'Europe/Copenhagen'),
-- rådgiverens uge — samme greb som regel 6 (20260910220000). UTC og dansk
-- tid er kun uenige søndag 22–24 UTC (CEST) / 23–24 (CET); et 04:05-UTC-job
-- ligger aldrig dér. En manuel kørsel fra editoren søndag aften gør.
--
-- CHECK-constrainten afgjort_kraever_afgoerer fritager 'expired' fra
-- decided_by/decided_at — et UPDATE uden afgører er lovligt. Der er ingen
-- closed_at at stemple på agent_proposals; decided_at forbliver NULL, som
-- de fire der blev sat i hånden 1/9 (agentforslagVenter.guard.test.ts).
--
-- RLS blokerer ikke: pg_cron kører body'en som postgres (tabelejeren).
--
-- Slot 04:05 UTC: ledigt (kortlagt 10/9: 04:00 opgave-udloeb, 05:00
-- agent-runs-opbevaring, 05:20 report-review-cron, 06:00 weekly-focus
-- (mandag), 07:00 event-reminders, 08:00 digest (d. 22), 09:00–09:30 de
-- fire morgenjobs). Ligger FØR weekly-focus mandag 06:00, så ugens gamle
-- forslag er lukket inden nye foreslås.
--
-- BEVIS uden at vente — SELECT-modstykke med ORDRET samme WHERE som
-- job-body'en (kør før/efter første kørsel):
--
--   SELECT id, company_id, tool, proposed_at,
--          to_char(proposed_at AT TIME ZONE 'Europe/Copenhagen', 'IYYY-"W"IW') AS uge
--   FROM public.agent_proposals
--   WHERE status = 'proposed'
--     AND to_char(proposed_at AT TIME ZONE 'Europe/Copenhagen', 'IYYY-"W"IW')
--      <> to_char(now()       AT TIME ZONE 'Europe/Copenhagen', 'IYYY-"W"IW')
--   ORDER BY proposed_at;
--
-- Revert: SELECT cron.unschedule('agentforslag-udloeb');
--   Allerede-lukkede rækker genåbnes ikke — expired er en sluttilstand.
--
-- IKKE KØRT. DEPLOY: manuelt i Lovable -> SQL editor efter merge
-- (CLAUDE.md — migrationer auto-deployer aldrig). Verificér med cron.job-
-- SELECT'en nederst + bevis-SELECT'en ovenfor.

-- ── 1. Idempotent unschedule-værn (genkørsel af migrationen er ufarlig) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agentforslag-udloeb') THEN
    PERFORM cron.unschedule('agentforslag-udloeb');
  END IF;
END $$;

-- ── 2. Jobbet ──
SELECT cron.schedule(
  'agentforslag-udloeb',
  '5 4 * * *',
  $job$
  UPDATE public.agent_proposals
  SET status = 'expired'
  WHERE status = 'proposed'
    AND to_char(proposed_at AT TIME ZONE 'Europe/Copenhagen', 'IYYY-"W"IW')
     <> to_char(now()       AT TIME ZONE 'Europe/Copenhagen', 'IYYY-"W"IW');
  $job$
);

-- ── 3. Efter-verifikation: jobbet står aktivt ──
SELECT jobid, jobname, schedule, active FROM cron.job
WHERE jobname = 'agentforslag-udloeb';
