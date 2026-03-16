
-- ============================================================
-- Phase 1A: Financial Report Facts Layer
-- Single owning report per company-period. No legacy fallback.
-- ============================================================

-- 1) facts table
CREATE TABLE public.financial_report_facts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id),
  period_key       text NOT NULL,
  period_label     text NOT NULL,
  source_report_id uuid NOT NULL REFERENCES public.financial_reports(id),
  source_type      text NOT NULL CHECK (source_type IN ('canonical','manual')),
  metrics          jsonb NOT NULL,
  committed_at     timestamptz NOT NULL DEFAULT now(),
  committed_by     uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_key)
);

COMMENT ON TABLE public.financial_report_facts IS
  'Phase 1A facts layer. Single owning report per company-period. '
  'Multi-source merge NOT supported — collision guard rejects different source_report_id. '
  'Only canonical English metric keys are stored in metrics jsonb.';

ALTER TABLE public.financial_report_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view own facts"
  ON public.financial_report_facts FOR SELECT
  TO authenticated
  USING (company_id = user_company_id(auth.uid()));

CREATE POLICY "Advisors can view all facts"
  ON public.financial_report_facts FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- 2) temporary backfill diagnostic log
CREATE TABLE public._facts_backfill_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at           timestamptz NOT NULL DEFAULT now(),
  report_id        uuid NOT NULL,
  company_id       uuid,
  period_key       text,
  source_type      text,
  result           text NOT NULL CHECK (result IN ('committed','collision','ineligible','error')),
  detail           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public._facts_backfill_log IS
  'Temporary Phase 1A backfill diagnostic log. '
  'Records source_type per entry for Phase 1B validation. '
  'Intended for removal after Phase 1B consumer cutover is validated.';

ALTER TABLE public._facts_backfill_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view backfill log"
  ON public._facts_backfill_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- 3) commit_report_facts function
CREATE OR REPLACE FUNCTION public.commit_report_facts(p_report_id uuid)
  RETURNS public.financial_report_facts
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _report record;
  _source_type text;
  _metrics jsonb;
  _period_key text;
  _period_label text;
  _existing record;
  _result public.financial_report_facts;
  _raw_metrics jsonb;
  _mapped jsonb := '{}'::jsonb;
  _k text;
  _v numeric;
  _canonical_key text;
  _has_any boolean := false;
BEGIN
  -- Load report
  SELECT * INTO _report
  FROM public.financial_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found: %', p_report_id;
  END IF;

  IF _report.status != 'processed' THEN
    RAISE EXCEPTION 'Report status is %, expected processed', _report.status;
  END IF;

  IF _report.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Report is soft-deleted';
  END IF;

  -- Source resolution (NO legacy fallback)
  IF _report.manual_override_status = 'applied'
     AND _report.manual_normalized_data IS NOT NULL
     AND (_report.manual_normalized_data -> 'metrics') IS NOT NULL
  THEN
    _source_type := 'manual';
    _raw_metrics := _report.manual_normalized_data -> 'metrics';

    -- Map Danish keys to canonical English
    FOR _k, _v IN SELECT key, value::numeric FROM jsonb_each_text(_raw_metrics) WHERE value IS NOT NULL AND value ~ '^-?[0-9]'
    LOOP
      _canonical_key := CASE _k
        WHEN 'omsaetning' THEN 'revenue'
        WHEN 'daekningsbidrag' THEN 'gross_profit'
        WHEN 'bruttofortjeneste' THEN 'gross_profit'
        WHEN 'loenninger' THEN 'payroll'
        WHEN 'direkte_omkostninger' THEN 'cogs'
        WHEN 'salgsomkostninger' THEN 'sales_costs'
        WHEN 'lokaleomkostninger' THEN 'facility_costs'
        WHEN 'administrationsomkostninger' THEN 'admin_costs'
        WHEN 'afskrivninger' THEN 'depreciation'
        WHEN 'resultat_foer_skat' THEN 'ebt'
        WHEN 'resultat_efter_skat' THEN 'net_result'
        WHEN 'aktiver_i_alt' THEN 'assets_total'
        WHEN 'egenkapital' THEN 'equity_total'
        WHEN 'bank_balance' THEN 'cash'
        WHEN 'likvider' THEN 'cash'
        WHEN 'debitorer' THEN 'trade_receivables'
        WHEN 'kreditorer' THEN 'current_liabilities'
        ELSE NULL
      END;

      IF _canonical_key IS NOT NULL THEN
        -- First mapped key wins (no silent overwrite)
        IF NOT (_mapped ? _canonical_key) THEN
          _mapped := _mapped || jsonb_build_object(_canonical_key, _v);
          _has_any := true;
        END IF;
      END IF;
    END LOOP;

    _metrics := _mapped;
    _period_key := _report.manual_report_period_key;
    _period_label := COALESCE(_report.manual_report_period_label, _report.report_period);

  ELSIF _report.validation_status = 'PASS'
     AND _report.normalized_data IS NOT NULL
     AND (_report.normalized_data -> 'metrics') IS NOT NULL
  THEN
    _source_type := 'canonical';
    _raw_metrics := _report.normalized_data -> 'metrics';

    -- Canonical metrics are already in English keys — filter to known keys only
    FOR _k, _v IN SELECT key, value::numeric FROM jsonb_each_text(_raw_metrics) WHERE value IS NOT NULL AND value ~ '^-?[0-9]'
    LOOP
      IF _k IN ('revenue','gross_profit','payroll','cogs','sales_costs','facility_costs',
                 'admin_costs','depreciation','ebt','net_result','assets_total',
                 'equity_total','cash','trade_receivables','current_liabilities') THEN
        _mapped := _mapped || jsonb_build_object(_k, _v);
        _has_any := true;
      END IF;
    END LOOP;

    _metrics := _mapped;
    _period_key := parse_dk_report_period_key(_report.report_period);
    _period_label := _report.report_period;

  ELSE
    RAISE EXCEPTION 'Report not eligible: no canonical PASS or manual-approved metrics (report_id=%)', p_report_id;
  END IF;

  -- Empty metrics guard
  IF NOT _has_any THEN
    RAISE EXCEPTION 'No mappable metrics for facts commit (report_id=%)', p_report_id;
  END IF;

  -- Period validation
  IF _period_key IS NULL OR _period_key = '' THEN
    RAISE EXCEPTION 'Cannot resolve period key from report period (report_id=%)', p_report_id;
  END IF;

  -- Collision guard (single-owner contract)
  SELECT * INTO _existing
  FROM public.financial_report_facts
  WHERE company_id = _report.company_id AND period_key = _period_key;

  IF FOUND THEN
    IF _existing.source_report_id != p_report_id THEN
      RAISE EXCEPTION 'Period % for company % already owned by report %. Multi-source merge not supported. (attempted_report=%)',
        _period_key, _report.company_id, _existing.source_report_id, p_report_id;
    END IF;
    -- Re-commit (same source)
    UPDATE public.financial_report_facts
    SET metrics = _metrics,
        source_type = _source_type,
        period_label = _period_label,
        committed_at = now()
    WHERE id = _existing.id
    RETURNING * INTO _result;
  ELSE
    INSERT INTO public.financial_report_facts (company_id, period_key, period_label, source_report_id, source_type, metrics)
    VALUES (_report.company_id, _period_key, _period_label, p_report_id, _source_type, _metrics)
    RETURNING * INTO _result;
  END IF;

  RETURN _result;
END;
$$;

COMMENT ON FUNCTION public.commit_report_facts(uuid) IS
  'Commits a single report''s metrics into the facts layer. '
  'Enforces single-owner-per-period, no legacy fallback, empty metrics rejection. '
  'Manual Danish keys are mapped to canonical English. Unknown keys are dropped.';

-- 4) Backfill
DO $$
DECLARE
  _r record;
  _committed int := 0;
  _collision int := 0;
  _ineligible int := 0;
  _error int := 0;
  _run_ts timestamptz := now();
  _source text;
BEGIN
  FOR _r IN
    SELECT id, company_id, validation_status, manual_override_status,
           normalized_data, manual_normalized_data, report_period
    FROM public.financial_reports
    WHERE status = 'processed'
      AND deleted_at IS NULL
      AND (
        (validation_status = 'PASS' AND normalized_data IS NOT NULL AND (normalized_data -> 'metrics') IS NOT NULL)
        OR
        (manual_override_status = 'applied' AND manual_normalized_data IS NOT NULL AND (manual_normalized_data -> 'metrics') IS NOT NULL)
      )
  LOOP
    -- Determine source_type for logging
    IF _r.manual_override_status = 'applied'
       AND _r.manual_normalized_data IS NOT NULL
       AND (_r.manual_normalized_data -> 'metrics') IS NOT NULL
    THEN
      _source := 'manual';
    ELSE
      _source := 'canonical';
    END IF;

    BEGIN
      PERFORM commit_report_facts(_r.id);
      _committed := _committed + 1;
      INSERT INTO public._facts_backfill_log (run_at, report_id, company_id, period_key, source_type, result)
      VALUES (_run_ts, _r.id, _r.company_id,
              COALESCE(
                CASE WHEN _source = 'manual' THEN (SELECT manual_report_period_key FROM financial_reports WHERE id = _r.id)
                ELSE parse_dk_report_period_key(_r.report_period) END
              , 'unknown'),
              _source, 'committed');
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%already owned by report%' THEN
        _collision := _collision + 1;
        INSERT INTO public._facts_backfill_log (run_at, report_id, company_id, period_key, source_type, result, detail)
        VALUES (_run_ts, _r.id, _r.company_id, NULL, _source, 'collision', SQLERRM);
      ELSIF SQLERRM LIKE '%No mappable metrics%' OR SQLERRM LIKE '%Cannot resolve period%' THEN
        _ineligible := _ineligible + 1;
        INSERT INTO public._facts_backfill_log (run_at, report_id, company_id, period_key, source_type, result, detail)
        VALUES (_run_ts, _r.id, _r.company_id, NULL, _source, 'ineligible', SQLERRM);
      ELSE
        _error := _error + 1;
        INSERT INTO public._facts_backfill_log (run_at, report_id, company_id, period_key, source_type, result, detail)
        VALUES (_run_ts, _r.id, _r.company_id, NULL, _source, 'error', SQLERRM);
      END IF;
    END;
  END LOOP;

  RAISE NOTICE 'Backfill complete: committed=%, collision=%, ineligible=%, error=%',
    _committed, _collision, _ineligible, _error;
END;
$$;
