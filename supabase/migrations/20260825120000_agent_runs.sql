-- Migration: agent_runs — kørselstabel for run-company-agent
-- (docs/agent-forslag-design.md §4.2; docs/agent-forslag-recon.md §4/§8:
-- intet ræsonnement persisteres i dag — messages-arrayet lever kun i
-- hukommelsen, og der findes ingen kørselslog).
--
-- Én række pr. agentkørsel: virksomhed, trigger, tidspunkt, model,
-- iterationer, stopårsag, ræsonnementet (hele værktøjs- og svarsekvensen)
-- og de opsnappede skrive-forslag fra tør-kørsler.
--   * reasoning = messages-arrayet MINUS system-prompten (den er kode;
--     deploy_stamp identificerer prompt-versionen). Indeholder toolresultater
--     med virksomhedens tal — deraf RLS-valget nedenfor.
--   * proposals = de opsnappede skrivekald [{tool, args, iteration,
--     proposed_at}] — kun udfyldt for mode='dry_run'.
--   * Append-only: rækker opdateres aldrig, derfor ingen updated_at/-trigger.
--
-- RLS — genbrugte mønstre fra SECURITY_BASELINE.md §5:
--   * "Advisor access (full read)": SELECT gated af
--     has_role(auth.uid(), 'advisor').
--   * "Service-role-only tables": ingen klient-INSERT/UPDATE/DELETE — kun
--     edge-funktionen (service role) skriver. Samme afvigelsesform som
--     company_actions (klient har SELECT, skrivning er service-role-only),
--     men BEVIDST UDEN medlems-SELECT: ræsonnementet er rå model-output
--     over virksomhedens tal og er ikke kurateret til medlemmet.
--
-- OPBEVARING (FORSLAG — designets §6.3 er et åbent spørgsmål; dette er
-- Claudes forslag 2026-08-25, IKKE besluttet): reasoning nulstilles (sættes
-- til '[]') efter 90 dage; rækken med metadata + proposals beholdes 12
-- måneder og slettes derefter. Ingen oprydnings-cron i denne migration —
-- den besluttes og bygges særskilt når opbevaringstiden er afgjort.
--
-- ON DELETE CASCADE på company_id — samme form som company_actions og
-- weekly_focus (migration 20260329190316); milestones mangler den, og det
-- hul skal ikke gentages her.
--
-- DEPLOY: køres MANUELT i Lovable -> SQL editor efter merge (CLAUDE.md —
-- migrationer auto-deployer aldrig). Rækkefølge er bindende: denne SQL skal
-- være kørt FØR frontend-"Update" af tør-kørselsknapperne — en tør-kørsel
-- uden tabellen fejler ærligt med run_log_failed.
-- Verificér efter kørsel:
--   SELECT policyname, cmd, qual FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'agent_runs';

CREATE TABLE public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  period_key TEXT NOT NULL,
  period_label TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'live')),
  model TEXT NOT NULL,
  deploy_stamp TEXT NOT NULL,
  iterations INTEGER NOT NULL DEFAULT 0,
  stop_reason TEXT,
  produced_output BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  reasoning JSONB NOT NULL DEFAULT '[]',
  proposals JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view agent runs"
  ON public.agent_runs FOR SELECT
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage agent runs"
  ON public.agent_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_agent_runs_company ON public.agent_runs(company_id, started_at DESC);

CREATE INDEX idx_agent_runs_mode ON public.agent_runs(mode, started_at DESC);
