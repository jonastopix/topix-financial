
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
        source_report_id = p_report_id,
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
$function$
