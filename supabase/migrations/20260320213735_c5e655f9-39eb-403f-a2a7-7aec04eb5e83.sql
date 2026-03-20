CREATE OR REPLACE FUNCTION public.get_report_commit_preview(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid;
  _candidate public.report_commit_candidate;
  _report_company uuid;
  _quality_signals jsonb;
  _extraction_contract_version text;
BEGIN
  _caller := auth.uid();
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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

  SELECT fr.quality_signals, fr.extraction_contract_version
  INTO _quality_signals, _extraction_contract_version
  FROM public.financial_reports fr
  WHERE fr.id = p_report_id;

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
    'existing_owner_id', _candidate.existing_owner_id,
    'can_commit', _candidate.can_commit,
    'state', _candidate.state,
    'state_reason', _candidate.state_reason,
    'quality_signals', _quality_signals,
    'extraction_contract_version', _extraction_contract_version
  );
END;
$function$;