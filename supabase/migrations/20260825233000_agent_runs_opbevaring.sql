-- Migration: agent_runs opbevaring (design §6.3 — besluttet 2026-08-25,
-- Jonas + arkitekt; lukker det åbne spørgsmål fra 20260825120000's
-- migrationskommentar, som står urørt som historik).
--
-- To regler, UAFHÆNGIGE af hinanden (dom B). Aldersankeret er created_at
-- (NOT NULL med default) — hverken started_at eller finished_at, som kan
-- mangle/afvige på fejlede kørsler:
--   1) reasoning sættes til ægte NULL når kørslen er ældre end 90 dage.
--      NULL betyder entydigt "fjernet ved opbevaring"; '[]' ville være
--      uskelneligt fra en kørsel uden ræsonnement — deraf DROP NOT NULL
--      (dom A). Rækker der allerede står med '[]' røres IKKE: sådan en
--      kørsel havde aldrig et ræsonnement, og at sætte den til NULL
--      ville mærke den som "fjernet ved opbevaring" — de to betydninger
--      ('[]' = kørsel uden ræsonnement, NULL = fjernet ved opbevaring)
--      må ikke smelte sammen over tid. Reglen filtrerer IKKE på forslag:
--      også kørsler der bliver stående efter regel 2 mister deres
--      ræsonnement.
--   2) agent_runs-rækken slettes når den er ældre end 12 måneder OG ingen
--      af dens forslag har status approved eller rejected. FK'en
--      agent_proposals.run_id er ON DELETE CASCADE (20260825200000:39):
--      en kørsel der førte til en afgørelse bliver stående — afgørelsen
--      er læringen, og cascaden ville slette den. Uafgjorte/expired
--      forslag følger med rækken ud.
--
-- Ren SQL i pg_cron — ingen edge function (Deno.cron kører ikke på
-- Supabase edge runtime), intet vault-opslag, ingen URL (fejlkilderne fra
-- 20260810230000-oprydningen). Repoets FØRSTE rene SQL-cron; skabelonen
-- er ellers 20260810230000_cron_oprydning.sql. pg_cron kører body'en som
-- postgres (tabelejer) — RLS gælder ikke ejeren, så service-role-only-
-- policies på agent_runs/agent_proposals blokerer ikke jobbet.
--
-- Slot 05:00 UTC er ledigt (slot-kortlægningen i 20260810230000: 06:00
-- bærer generate-weekly-focus mandag morgen, 07/08/09 er optaget).
--
-- BEVIS uden at vente 90 dage / 12 måneder — SELECT-modstykker med ORDRET
-- samme WHERE-betingelser som job-body'en:
--
--   -- Regel 1: hvilke rækker VILLE få reasoning = NULL nu:
--   SELECT id, company_id, created_at
--   FROM public.agent_runs
--   WHERE created_at < now() - interval '90 days'
--     AND reasoning IS NOT NULL
--     AND reasoning <> '[]'::jsonb;
--
--   -- Regel 2: hvilke rækker VILLE slettes nu:
--   SELECT r.id, r.company_id, r.created_at
--   FROM public.agent_runs r
--   WHERE r.created_at < now() - interval '12 months'
--     AND NOT EXISTS (
--       SELECT 1 FROM public.agent_proposals p
--       WHERE p.run_id = r.id AND p.status IN ('approved', 'rejected')
--     );
--
-- PRÆDIKAT-BEVIS I DAG (interval '0 days' i stedet for '12 months' —
-- viser hvad sletningsreglen ville ramme, hvis alt var gammelt nok):
-- kørsler med mindst ét approved/rejected-forslag skal IKKE optræde;
-- kørsler uden skal. afgjorte-kolonnen skal være 0 på hver returneret
-- række — en række med afgjorte > 0 er et prædikat-brud:
--
--   SELECT r.id, r.created_at,
--     (SELECT count(*) FROM public.agent_proposals p
--      WHERE p.run_id = r.id AND p.status IN ('approved', 'rejected')) AS afgjorte
--   FROM public.agent_runs r
--   WHERE r.created_at < now() - interval '0 days'
--     AND NOT EXISTS (
--       SELECT 1 FROM public.agent_proposals p
--       WHERE p.run_id = r.id AND p.status IN ('approved', 'rejected')
--     )
--   ORDER BY r.created_at;
--
-- Revert: SELECT cron.unschedule('agent-runs-opbevaring');
--   NOT NULL-constrainten genindføres ikke automatisk — har jobbet kørt,
--   findes NULL-rækker, og SET NOT NULL kræver først backfill til '[]'.
--
-- DEPLOY: manuelt i Lovable -> SQL editor efter merge (CLAUDE.md —
-- migrationer auto-deployer aldrig).

-- ── 1. reasoning skal kunne bære ægte NULL (= "fjernet ved opbevaring") ──
ALTER TABLE public.agent_runs ALTER COLUMN reasoning DROP NOT NULL;

-- ── 2. Idempotent unschedule-værn (genkørsel af migrationen er ufarlig) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-runs-opbevaring') THEN
    PERFORM cron.unschedule('agent-runs-opbevaring');
  END IF;
END $$;

-- ── 3. Jobbet: regel 1 FØR regel 2, samme body — fejler regel 1, køres
--       regel 2 ikke (én session; næste døgns kørsel samler op) ──
SELECT cron.schedule(
  'agent-runs-opbevaring',
  '0 5 * * *',
  $job$
  UPDATE public.agent_runs
  SET reasoning = NULL
  WHERE created_at < now() - interval '90 days'
    AND reasoning IS NOT NULL
    AND reasoning <> '[]'::jsonb;
  DELETE FROM public.agent_runs r
  WHERE r.created_at < now() - interval '12 months'
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_proposals p
      WHERE p.run_id = r.id AND p.status IN ('approved', 'rejected')
    );
  $job$
);

-- ── 4. Efter-verifikation: jobbet står aktivt, kolonnen er nullable ──
SELECT jobid, jobname, schedule, active FROM cron.job
WHERE jobname = 'agent-runs-opbevaring';
SELECT is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agent_runs'
  AND column_name = 'reasoning';
