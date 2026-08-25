-- Migration: agent_proposals — ét forslag pr. række, klar til godkendelseslaget
-- (docs/agent-forslag-design.md §7; recon docs/agent-forslag-recon.md +
-- agent-godkendelse-recon 2026-08-25: agent_runs.proposals er et jsonb-array
-- uden stabil nøgle — beslutninger kan ikke hænges på et array-index).
--
-- Formen:
--   * (run_id, position) er identiteten — position er arrayets rækkefølge
--     fra kørslen. UNIQUE gør backfill og genkørsel idempotent.
--   * status-livscyklus: proposed -> approved/rejected (rådgiver-afgørelse,
--     kommer i senere PR) eller expired (cron-dom, ikke bygget endnu).
--   * forkast_kraever_grund: A4 — "en forkastelse uden grund er tabt
--     læring". Håndhævet som CHECK i databasen, ikke i UI'et, så ingen
--     fremtidig flade kan gentage AdvisorAlertsPanels hardcodede
--     afvisningsnote.
--   * afgjort_kraever_afgoerer: en afgørelse uden afsender/tidspunkt er
--     ikke en afgørelse.
--   * edited_args: rådgiverens redigerede version ("Redigér og godkend",
--     design §4.3) — args forbliver agentens originale forslag.
--
-- RLS — samme mønstre som agent_runs (SECURITY_BASELINE.md §5):
--   advisor-SELECT via has_role; service role ALL. INGEN
--   klient-INSERT/UPDATE/DELETE: alle skrivninger (også fremtidige
--   afgørelser) går gennem edge functions, hvor overgange kan dømmes
--   ét sted (opgave-modellens skrivevejs-mønster).
--
-- DEPLOY: denne migration er rent additiv og skal køres i Lovables SQL
-- editor FØR PR'en merges. Edge-funktionen auto-deployer ved merge og
-- kræver tabellen fra det øjeblik. Køres SQL'en først, findes der intet
-- vindue hvor tør-kørsler fejler (proposals_log_failed er fortsat den
-- ærlige fejl, hvis rækkefølgen alligevel brydes).
-- Verificér efter kørsel:
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename='agent_proposals';
--   SELECT count(*) FROM public.agent_proposals;  -- = summen af
--   jsonb_array_length(proposals) over agent_runs

CREATE TABLE public.agent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position int NOT NULL,
  tool text NOT NULL,
  args jsonb NOT NULL,
  iteration int NOT NULL,
  proposed_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'expired')),
  edited_args jsonb,
  decision_reason text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, position),
  CONSTRAINT forkast_kraever_grund CHECK (
    status <> 'rejected'
    OR (decision_reason IS NOT NULL AND length(btrim(decision_reason)) > 0)
  ),
  CONSTRAINT afgjort_kraever_afgoerer CHECK (
    status IN ('proposed', 'expired')
    OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

ALTER TABLE public.agent_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view agent proposals"
  ON public.agent_proposals FOR SELECT
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage agent proposals"
  ON public.agent_proposals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_agent_proposals_company_status
  ON public.agent_proposals(company_id, status);

CREATE INDEX idx_agent_proposals_run
  ON public.agent_proposals(run_id);

-- ── Backfill: eksisterende kørslers proposals-arrays → én række pr.
--    element. position = ordinality-1 (0-baseret som edge-funktionens
--    fremtidige inserts). Idempotent via ON CONFLICT på (run_id, position).
--    Elementer uden 'tool' springes over (tool er NOT NULL); proposed_at
--    falder tilbage til kørslens started_at, iteration til 0. ──

INSERT INTO public.agent_proposals
  (run_id, company_id, position, tool, args, iteration, proposed_at, status)
SELECT
  r.id,
  r.company_id,
  (p.ordinality - 1)::int,
  p.elem->>'tool',
  COALESCE(p.elem->'args', '{}'::jsonb),
  COALESCE((p.elem->>'iteration')::int, 0),
  COALESCE((p.elem->>'proposed_at')::timestamptz, r.started_at),
  'proposed'
FROM public.agent_runs r
CROSS JOIN LATERAL jsonb_array_elements(r.proposals) WITH ORDINALITY AS p(elem, ordinality)
WHERE p.elem->>'tool' IS NOT NULL
ON CONFLICT (run_id, position) DO NOTHING;
