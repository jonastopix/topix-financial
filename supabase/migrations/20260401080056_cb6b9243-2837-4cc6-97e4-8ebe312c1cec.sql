
CREATE OR REPLACE FUNCTION public.resolve_report_commit_candidate(p_report_id uuid)
 RETURNS report_commit_candidate
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _owner_deleted_at timestamptz;
BEGIN
  _out.report_id := p_report_id;

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

  -- ========== MANUAL OVERRIDE (highest priority, both V1 and V2) ==========
  IF _r.manual_override_status = 'applied'
     AND _r.manual_normalized_data IS NOT NULL
     AND (_r.manual_normalized_data -> 'metrics') IS NOT NULL
  THEN
    _out.source_type := 'manual';
    _out.validation_status := 'manual-approved';
    _raw_metrics := _r.manual_normalized_data -> 'metrics';

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
        WHEN 'resultat_foer_afskrivninger' THEN 'ebitda'
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

  -- ========== V2 BRANCH: extraction_contract_version = 'v2' ==========
  ELSIF _r.extraction_contract_version = 'v2'
     AND _r.normalized_data IS NOT NULL
     AND (_r.normalized_data -> 'metrics') IS NOT NULL
  THEN
    _out.source_type := 'canonical_v2';
    _out.validation_status := COALESCE(_r.validation_status, 'unknown');
    _raw_metrics := _r.normalized_data -> 'metrics';

    FOR _k, _v IN
      SELECT key, value::numeric
      FROM jsonb_each_text(_raw_metrics)
      WHERE value IS NOT NULL AND value ~ '^-?[0-9]'
    LOOP
      IF _k IN ('revenue','gross_profit','payroll','cogs','sales_costs','facility_costs',
                 'admin_costs','depreciation','ebt','ebitda','ebit','net_result','assets_total',
                 'equity_total','cash','trade_receivables','current_liabilities',
                 'trade_payables','unbilled_wip') THEN
        _mapped := _mapped || jsonb_build_object(_k, _v);
        _has_any := true;
      END IF;
    END LOOP;

    _out.metrics_preview := _mapped;
    _out.period_key := parse_dk_report_period_key(_r.report_period);
    _out.period_label := _r.report_period;

  -- ========== V1 BRANCH: requires validation_status = 'PASS' ==========
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
                 'admin_costs','depreciation','ebt','ebitda','ebit','net_result','assets_total',
                 'equity_total','cash','trade_receivables','current_liabilities',
                 'trade_payables','unbilled_wip') THEN
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

  IF NOT _has_any THEN
    _out.eligible := false;
    _out.eligibility_reason := 'No mappable metrics after filtering';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Ingen mappable metrics fundet';
    RETURN _out;
  END IF;

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
      SELECT deleted_at INTO _owner_deleted_at
      FROM public.financial_reports
      WHERE id = _existing.source_report_id;

      IF _owner_deleted_at IS NOT NULL THEN
        _out.ownership_state := 'none';
        _out.can_commit := true;
        _out.state := 'ready';
        _out.state_reason := NULL;
      ELSE
        _out.ownership_state := 'other_report';
        _out.can_commit := false;
        _out.state := 'blocked';
        _out.state_reason := format('Periode %s ejes af rapport %s', _out.period_key, _existing.source_report_id);
      END IF;
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
$function$;
