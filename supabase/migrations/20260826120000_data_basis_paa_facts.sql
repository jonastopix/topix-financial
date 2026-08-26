-- ────────────────────────────────────────────────────────────────────────────
-- data_basis på financial_report_facts: gør estimater skelnelige fra målinger.
--
-- SKELNEN (kontrakten for alle fremtidige skrivere):
--   source_type bærer HVEM der skrev rækken (canonical/canonical_v2/manual/
--   annual_report/manual_baseline/baseline — skrivevejens identitet).
--   data_basis bærer HVAD rækken er:
--     'measured'  = tal fra en rigtig periode-rapport for netop den måned
--     'estimated' = afledt/fordelt tal (årsrapport divideret med 12,
--                   baseline-fordeling bag sentinel-rapport, o.lign.)
--   source_type kan IKKE bære denne dom: 'manual' dækker i prod både rigtige
--   måneds-commits (commit_report_facts) og baseline-fordelinger
--   (save-annual-baseline bag _annual_baseline_sentinel_-attrappen).
--
-- Default'en 'measured' findes KUN som værn mod en overset fremtidig skriver —
-- alle kendte skriveveje sætter kolonnen eksplicit (håndhævet af CI-testen
-- src/test/factsDataBasisGuard.test.ts). Læn dig aldrig på default'en.
-- ────────────────────────────────────────────────────────────────────────────

-- SELECT-før (kør og notér inden backfill):
--   SELECT count(*) AS i_alt,
--          count(*) FILTER (WHERE source_type = 'annual_report') AS annual,
--          count(*) FILTER (WHERE source_report_id IN (
--            SELECT id FROM financial_reports
--            WHERE file_name LIKE '\_annual\_baseline\_sentinel\_%'))
--            AS sentinel_baseline
--   FROM financial_report_facts;
--   i_alt: 330   annual: 156   sentinel_baseline: 12   (målt 2026-08-26)
--   Grupperne overlapper ikke; ingen række uden source_report_id.

ALTER TABLE public.financial_report_facts
  ADD COLUMN data_basis text NOT NULL DEFAULT 'measured'
  CHECK (data_basis IN ('measured', 'estimated'));

COMMENT ON COLUMN public.financial_report_facts.data_basis IS
  'HVAD rækken er: measured = tal fra rigtig periode-rapport; estimated = afledt/fordelt (årsrapport /12, baseline). source_type bærer HVEM der skrev. Default measured er et værn mod oversete skrivere, ikke normalvejen.';

-- Backfill, i denne rækkefølge:

-- 1) Årsrapport-fordelinger (årstal /12 kopieret ud i 12 måneder).
UPDATE public.financial_report_facts
SET data_basis = 'estimated'
WHERE source_type = 'annual_report';
-- forventet: UPDATE 156

-- 2) Baseline-rækker bag sentinel-attrappen. Fanger BÅDE save-annual-baseline
--    (skriver source_type='manual') og auto-create-baseline-budget
--    (source_type='manual_baseline') — begge bruger samme sentinel-filnavn.
--    Underscores er LIKE-escaped: '_' er ellers wildcard.
UPDATE public.financial_report_facts
SET data_basis = 'estimated'
WHERE source_report_id IN (
  SELECT id FROM public.financial_reports
  WHERE file_name LIKE '\_annual\_baseline\_sentinel\_%'
);
-- forventet: UPDATE 12

-- 3) Resten forbliver 'measured' via default — ingen UPDATE nødvendig.

-- Efter-tal (kør og verificér mod det forventede):
--   SELECT data_basis, count(*) FROM financial_report_facts GROUP BY 1;
--   forventet: estimated 168, measured 162
--   SELECT count(*) FROM financial_report_facts;   forventet i alt: 330

-- ────────────────────────────────────────────────────────────────────────────
-- commit_report_facts: sæt data_basis EKSPLICIT i begge mutationsgrene.
-- Funktionen committer altid en rigtig periode-rapport for netop den måned
-- (alle resolver-grene: canonical, canonical_v2, manual) → 'measured'.
-- Eneste ændring mod 20260418082434-versionen er data_basis i UPDATE og
-- INSERT; auth-guards, collision-guard og øvrig logik er uændret ordret.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commit_report_facts(p_report_id uuid)
 RETURNS financial_report_facts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid;
  _candidate public.report_commit_candidate;
  _existing record;
  _result public.financial_report_facts;
  _owner_deleted_at timestamptz;
BEGIN
  -- Access guard
  _caller := auth.uid();
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve via shared helper
  _candidate := resolve_report_commit_candidate(p_report_id);

  -- Access check: caller must own the company or be advisor/admin
  IF _candidate.company_id IS NULL THEN
    RAISE EXCEPTION 'Report not found: %', p_report_id;
  END IF;

  IF _candidate.company_id != user_company_id(_caller)
     AND NOT has_role(_caller, 'advisor'::app_role) THEN
    RAISE EXCEPTION 'Access denied: not authorized for this company';
  END IF;

  -- Eligibility check
  IF NOT _candidate.eligible THEN
    RAISE EXCEPTION 'Report not eligible: % (report_id=%)', _candidate.eligibility_reason, p_report_id;
  END IF;

  -- Commit check
  IF NOT _candidate.can_commit THEN
    RAISE EXCEPTION 'Cannot commit: % (report_id=%)', _candidate.state_reason, p_report_id;
  END IF;

  -- Mutation
  SELECT * INTO _existing
  FROM public.financial_report_facts
  WHERE company_id = _candidate.company_id AND period_key = _candidate.period_key;

  IF FOUND THEN
    -- Collision guard: if a different report owns this period, only allow takeover
    -- when the current owner has been soft-deleted (Erstat gammel data flow).
    IF _existing.source_report_id != p_report_id THEN
      SELECT deleted_at INTO _owner_deleted_at
      FROM public.financial_reports
      WHERE id = _existing.source_report_id;

      IF _owner_deleted_at IS NULL THEN
        RAISE EXCEPTION 'Period % for company % already owned by report %. Multi-source merge not supported. (attempted_report=%)',
          _candidate.period_key, _candidate.company_id, _existing.source_report_id, p_report_id;
      END IF;
      -- Owner is soft-deleted: fall through and transfer ownership in the UPDATE below.
    END IF;

    UPDATE public.financial_report_facts
    SET metrics = _candidate.metrics_preview,
        source_report_id = p_report_id,
        source_type = _candidate.source_type,
        data_basis = 'measured',
        period_label = _candidate.period_label,
        committed_at = now(),
        committed_by = _caller
    WHERE id = _existing.id
    RETURNING * INTO _result;
  ELSE
    INSERT INTO public.financial_report_facts (company_id, period_key, period_label, source_report_id, source_type, data_basis, metrics, committed_by)
    VALUES (_candidate.company_id, _candidate.period_key, _candidate.period_label, p_report_id, _candidate.source_type, 'measured', _candidate.metrics_preview, _caller)
    RETURNING * INTO _result;
  END IF;

  RETURN _result;
END;
$function$;

-- Verifikation efter kørsel i Lovable SQL editor:
--   SELECT pg_get_functiondef('public.commit_report_facts(uuid)'::regprocedure);
--   (skal indeholde data_basis i både UPDATE- og INSERT-grenen)
