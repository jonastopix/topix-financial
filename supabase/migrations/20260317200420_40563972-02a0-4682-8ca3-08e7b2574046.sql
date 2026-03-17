
-- ============================================================
-- RP-1: Shared helper + hardened commit + preview/card RPCs
-- ============================================================

-- 1) Composite type for the shared helper return
DROP TYPE IF EXISTS public.report_commit_candidate CASCADE;
CREATE TYPE public.report_commit_candidate AS (
  report_id uuid,
  company_id uuid,
  eligible boolean,
  eligibility_reason text,
  source_type text,
  period_key text,
  period_label text,
  report_type text,
  validation_status text,
  metrics_preview jsonb,
  ownership_state text,
  existing_owner_id uuid,
  can_commit boolean,
  state text,
  state_reason text
);

-- 2) Internal shared helper — pure resolution, no access logic
CREATE OR REPLACE FUNCTION public.resolve_report_commit_candidate(p_report_id uuid)
RETURNS public.report_commit_candidate
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _r record;
  _out public.report_commit_candidate;
  _raw_metrics jsonb;
  _mapped jsonb := '{}'::jsonb;
  _k text;
  _v numeric;
  _canonical_key text;
  _has_any boolean := false;
  _existing record;
BEGIN
  _out.report_id := p_report_id;

  -- Load report
  SELECT * INTO _r
  FROM public.financial_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    _out.eligible := false;
    _out.eligibility_reason := 'Report not found';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Rapport ikke fundet';
    RETURN _out;
  END IF;

  _out.company_id := _r.company_id;
  _out.report_type := COALESCE(_r.manual_report_type, _r.report_type);

  IF _r.deleted_at IS NOT NULL THEN
    _out.eligible := false;
    _out.eligibility_reason := 'Report is soft-deleted';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Rapport er slettet';
    RETURN _out;
  END IF;

  IF _r.status != 'processed' THEN
    _out.eligible := false;
    _out.eligibility_reason := format('Status is %s, expected processed', _r.status);
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := format('Rapport har status: %s', _r.status);
    RETURN _out;
  END IF;

  -- Source resolution (NO legacy fallback)
  IF _r.manual_override_status = 'applied'
     AND _r.manual_normalized_data IS NOT NULL
     AND (_r.manual_normalized_data -> 'metrics') IS NOT NULL
  THEN
    _out.source_type := 'manual';
    _out.validation_status := 'manual-approved';
    _raw_metrics := _r.manual_normalized_data -> 'metrics';

    -- Map Danish keys to canonical English
    FOR _k, _v IN
      SELECT key, value::numeric
      FROM jsonb_each_text(_raw_metrics)
      WHERE value IS NOT NULL AND value ~ '^-?[0-9]'
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
        IF NOT (_mapped ? _canonical_key) THEN
          _mapped := _mapped || jsonb_build_object(_canonical_key, _v);
          _has_any := true;
        END IF;
      END IF;
    END LOOP;

    _out.metrics_preview := _mapped;
    _out.period_key := _r.manual_report_period_key;
    _out.period_label := COALESCE(_r.manual_report_period_label, _r.report_period);

  ELSIF _r.validation_status = 'PASS'
     AND _r.normalized_data IS NOT NULL
     AND (_r.normalized_data -> 'metrics') IS NOT NULL
  THEN
    _out.source_type := 'canonical';
    _out.validation_status := 'PASS';
    _raw_metrics := _r.normalized_data -> 'metrics';

    FOR _k, _v IN
      SELECT key, value::numeric
      FROM jsonb_each_text(_raw_metrics)
      WHERE value IS NOT NULL AND value ~ '^-?[0-9]'
    LOOP
      IF _k IN ('revenue','gross_profit','payroll','cogs','sales_costs','facility_costs',
                 'admin_costs','depreciation','ebt','net_result','assets_total',
                 'equity_total','cash','trade_receivables','current_liabilities') THEN
        _mapped := _mapped || jsonb_build_object(_k, _v);
        _has_any := true;
      END IF;
    END LOOP;

    _out.metrics_preview := _mapped;
    _out.period_key := parse_dk_report_period_key(_r.report_period);
    _out.period_label := _r.report_period;

  ELSE
    _out.eligible := false;
    _out.eligibility_reason := 'No canonical PASS or manual-approved metrics';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Ingen godkendte metrics fundet';
    _out.validation_status := COALESCE(_r.validation_status, 'unknown');
    RETURN _out;
  END IF;

  -- Empty metrics guard
  IF NOT _has_any THEN
    _out.eligible := false;
    _out.eligibility_reason := 'No mappable metrics after filtering';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Ingen mappable metrics fundet';
    RETURN _out;
  END IF;

  -- Period validation
  IF _out.period_key IS NULL OR _out.period_key = '' THEN
    _out.eligible := false;
    _out.eligibility_reason := 'Cannot resolve period key';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Periode kunne ikke bestemmes';
    RETURN _out;
  END IF;

  _out.eligible := true;
  _out.eligibility_reason := NULL;

  -- Ownership lookup
  SELECT * INTO _existing
  FROM public.financial_report_facts
  WHERE company_id = _r.company_id AND period_key = _out.period_key;

  IF FOUND THEN
    _out.existing_owner_id := _existing.source_report_id;
    IF _existing.source_report_id = p_report_id THEN
      _out.ownership_state := 'same_report';
      _out.can_commit := true;
      _out.state := 'update_available';
      _out.state_reason := NULL;
    ELSE
      _out.ownership_state := 'other_report';
      _out.can_commit := false;
      _out.state := 'blocked';
      _out.state_reason := format('Periode %s ejes af rapport %s', _out.period_key, _existing.source_report_id);
    END IF;
  ELSE
    _out.ownership_state := 'none';
    _out.existing_owner_id := NULL;
    _out.can_commit := true;
    _out.state := 'ready';
    _out.state_reason := NULL;
  END IF;

  RETURN _out;
END;
$fn$;

-- Helper is internal only
REVOKE ALL ON FUNCTION public.resolve_report_commit_candidate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_report_commit_candidate(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_report_commit_candidate(uuid) FROM authenticated;

-- 3) Hardened commit_report_facts — delegates to helper
CREATE OR REPLACE FUNCTION public.commit_report_facts(p_report_id uuid)
RETURNS financial_report_facts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _caller uuid;
  _candidate public.report_commit_candidate;
  _existing record;
  _result public.financial_report_facts;
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
    UPDATE public.financial_report_facts
    SET metrics = _candidate.metrics_preview,
        source_type = _candidate.source_type,
        period_label = _candidate.period_label,
        committed_at = now(),
        committed_by = _caller
    WHERE id = _existing.id
    RETURNING * INTO _result;
  ELSE
    INSERT INTO public.financial_report_facts (company_id, period_key, period_label, source_report_id, source_type, metrics, committed_by)
    VALUES (_candidate.company_id, _candidate.period_key, _candidate.period_label, p_report_id, _candidate.source_type, _candidate.metrics_preview, _caller)
    RETURNING * INTO _result;
  END IF;

  RETURN _result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.commit_report_facts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_report_facts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_report_facts(uuid) TO authenticated;

-- 4) Preview RPC — thin wrapper with access guard
CREATE OR REPLACE FUNCTION public.get_report_commit_preview(p_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _caller uuid;
  _candidate public.report_commit_candidate;
  _report_company uuid;
BEGIN
  _caller := auth.uid();
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Minimal lookup for access check BEFORE calling helper
  SELECT company_id INTO _report_company
  FROM public.financial_reports
  WHERE id = p_report_id AND deleted_at IS NULL;

  IF _report_company IS NULL THEN
    RAISE EXCEPTION 'Report not found or deleted';
  END IF;

  IF _report_company != user_company_id(_caller)
     AND NOT has_role(_caller, 'advisor'::app_role) THEN
    RAISE EXCEPTION 'Access denied: not authorized for this report';
  END IF;

  -- Resolve via shared helper
  _candidate := resolve_report_commit_candidate(p_report_id);

  RETURN jsonb_build_object(
    'report_id', _candidate.report_id,
    'eligible', _candidate.eligible,
    'eligibility_reason', _candidate.eligibility_reason,
    'source_type', _candidate.source_type,
    'period_key', _candidate.period_key,
    'period_label', _candidate.period_label,
    'report_type', _candidate.report_type,
    'validation_status', _candidate.validation_status,
    'metrics_preview', _candidate.metrics_preview,
    'ownership_state', _candidate.ownership_state,
    'can_commit', _candidate.can_commit,
    'state', _candidate.state,
    'state_reason', _candidate.state_reason
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_report_commit_preview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_report_commit_preview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_report_commit_preview(uuid) TO authenticated;

-- 5) Card-state RPC — batched lateral join with access guard
CREATE OR REPLACE FUNCTION public.get_report_commit_states(p_company_id uuid)
RETURNS TABLE(
  report_id uuid,
  period_key text,
  ownership_state text,
  eligible boolean,
  can_commit boolean,
  state text,
  state_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _caller uuid;
BEGIN
  _caller := auth.uid();
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_company_id != user_company_id(_caller)
     AND NOT has_role(_caller, 'advisor'::app_role) THEN
    RAISE EXCEPTION 'Access denied: not authorized for this company';
  END IF;

  RETURN QUERY
  SELECT
    r.id AS report_id,
    h.period_key,
    h.ownership_state,
    h.eligible,
    h.can_commit,
    h.state,
    h.state_reason
  FROM public.financial_reports r
  CROSS JOIN LATERAL resolve_report_commit_candidate(r.id) h
  WHERE r.company_id = p_company_id
    AND r.deleted_at IS NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_report_commit_states(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_report_commit_states(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_report_commit_states(uuid) TO authenticated;
