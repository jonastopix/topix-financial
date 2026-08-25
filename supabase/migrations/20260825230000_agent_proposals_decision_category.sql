-- Migration: agent_proposals.decision_category — den tællelige forkast-dom
-- (docs/agent-forslag-design.md §4.4: fire faste grunde + 'andet'.
-- Kontrakten: kategorien er den TÆLLELIGE dom (stabile slugs, aldrig
-- visningstekst — en grund der ikke kan tælles er ikke læring);
-- decision_reason forbliver det menneskelige fritekst-spor og er fortsat
-- påkrævet ved rejected via forkast_kraever_grund).
--
-- RÆKKEFØLGEN I DENNE FIL ER BINDENDE: (1) tilføj kolonne + værdi-CHECK,
-- (2) backfill den eksisterende rejected-række, (3) FØRST DEREFTER
-- constraint'en der kræver kategori ved rejected — i omvendt rækkefølge
-- ville constraint'en fejle på den eksisterende række.
--
-- DEPLOY: rent additiv — køres i Lovables SQL editor FØR PR'en merges
-- (agent_proposals-lærdommen, PR #427): edge-funktionen auto-deployer ved
-- merge og sender decision_category ved reject fra det øjeblik. Køres
-- SQL'en først, findes der intet vindue hvor forkastelser fejler.
--
-- SELECT FØR kørsel:
--   SELECT status, count(*) FROM public.agent_proposals GROUP BY status;
--     FØR (målt 2026-08-25 13:09): proposed=7, approved=2, rejected=1, expired=0
--   SELECT id, status, decision_reason, decision_category
--   FROM public.agent_proposals WHERE status = 'rejected';
--     Målt: præcis én række, id f269b73c-0630-4ae6-aeed-3ba2beff8bc7,
--     decision_category IS NULL — bekræftet 2026-08-25 13:09.
--
-- SELECT EFTER kørsel:
--   SELECT count(*) FILTER (WHERE status='rejected') AS rejected,
--          count(*) FILTER (WHERE status='rejected' AND decision_category IS NULL) AS rejected_uden_kategori
--   FROM public.agent_proposals;
--     EFTER (forventet): rejected=1, rejected_uden_kategori=0 (SKAL være 0)
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='public.agent_proposals'::regclass AND conname LIKE '%kategori%';

-- ── 1. Kolonnen + værdisættet (stabile slugs, aldrig visningstekst) ──

ALTER TABLE public.agent_proposals
  ADD COLUMN decision_category text
  CONSTRAINT agent_proposals_decision_category_valid CHECK (
    decision_category IS NULL
    OR decision_category IN (
      'ikke_relevant',
      'forkert_tolkning',
      'allerede_talt_om',
      'forkert_timing',
      'andet'
    )
  );

-- ── 2. Backfill: den ene eksisterende rejected-række ──
-- Grunden var at tre nyere kørsler havde overhalet forslaget → forkert_timing.
-- Id-låst OG status-låst, så en genkørsel eller en anden række aldrig rammes.

UPDATE public.agent_proposals
SET decision_category = 'forkert_timing'
WHERE id = 'f269b73c-0630-4ae6-aeed-3ba2beff8bc7'
  AND status = 'rejected'
  AND decision_category IS NULL;

-- ── 3. FØRST NU: rejected kræver kategori (spejles i forslagEngine.ts'
--    validerKategori — motoren fejler før databasen ville) ──

ALTER TABLE public.agent_proposals
  ADD CONSTRAINT forkast_kraever_kategori CHECK (
    status <> 'rejected'
    OR decision_category IS NOT NULL
  );
