
-- Drop and recreate get_report_commit_states with new return columns
DROP FUNCTION IF EXISTS public.get_report_commit_states(uuid);

CREATE FUNCTION public.get_report_commit_states(p_company_id uuid)
RETURNS TABLE(
  report_id uuid,
  period_key text,
  ownership_state text,
  eligible boolean,
  can_commit boolean,
  state text,
  state_reason text,
  extraction_contract_version text,
  validation_status text
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
    h.state_reason,
    r.extraction_contract_version,
    h.validation_status
  FROM public.financial_reports r
  CROSS JOIN LATERAL resolve_report_commit_candidate(r.id) h
  WHERE r.company_id = p_company_id
    AND r.deleted_at IS NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_report_commit_states(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_report_commit_states(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_report_commit_states(uuid) TO authenticated;
