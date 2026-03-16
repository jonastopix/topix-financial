
-- Phase F: Advisor read-only group financial summary RPC
-- Dual access check: has_role(advisor) AND advisor_has_group_access

CREATE OR REPLACE FUNCTION public.get_group_financial_summary_for_advisor(p_group_id uuid)
RETURNS TABLE(
  company_id uuid,
  company_name text,
  logo_url text,
  has_report boolean,
  has_verified_metrics boolean,
  latest_report_id uuid,
  effective_period_label text,
  effective_period_key text,
  revenue numeric,
  gross_profit numeric,
  ebt numeric,
  cash numeric,
  missing_current_period boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Dual access check
  IF NOT has_role(auth.uid(), 'advisor') THEN
    RAISE EXCEPTION 'Access denied: not an advisor';
  END IF;
  IF NOT advisor_has_group_access(auth.uid(), p_group_id) THEN
    RAISE EXCEPTION 'Access denied: no access to this group';
  END IF;

  RETURN QUERY
  WITH group_cos AS (
    SELECT gc.company_id
    FROM group_companies gc
    WHERE gc.group_id = p_group_id
  ),
  latest_reports AS (
    SELECT DISTINCT ON (fr.company_id)
      fr.id,
      fr.company_id,
      fr.manual_override_status,
      fr.manual_normalized_data,
      fr.normalized_data,
      fr.report_period,
      fr.manual_report_period_key,
      fr.manual_report_period_label,
      CASE
        WHEN fr.manual_override_status = 'applied'
             AND fr.manual_normalized_data IS NOT NULL
             AND (fr.manual_normalized_data -> 'metrics') IS NOT NULL
        THEN 'manual'
        WHEN fr.normalized_data IS NOT NULL
             AND (fr.normalized_data -> 'metrics') IS NOT NULL
        THEN 'canonical'
        ELSE 'none'
      END AS _source,
      CASE
        WHEN fr.manual_override_status = 'applied'
             AND fr.manual_normalized_data IS NOT NULL
             AND (fr.manual_normalized_data -> 'metrics') IS NOT NULL
        THEN fr.manual_report_period_key
        ELSE parse_dk_report_period_key(fr.report_period)
      END AS _eff_period_key,
      CASE
        WHEN fr.manual_override_status = 'applied'
             AND fr.manual_normalized_data IS NOT NULL
             AND (fr.manual_normalized_data -> 'metrics') IS NOT NULL
        THEN fr.manual_report_period_label
        ELSE fr.report_period
      END AS _eff_period_label
    FROM financial_reports fr
    INNER JOIN group_cos gc ON gc.company_id = fr.company_id
    WHERE fr.status = 'processed'
      AND fr.deleted_at IS NULL
    ORDER BY fr.company_id,
      CASE
        WHEN fr.manual_override_status = 'applied'
             AND fr.manual_normalized_data IS NOT NULL
             AND (fr.manual_normalized_data -> 'metrics') IS NOT NULL
        THEN fr.manual_report_period_key
        ELSE parse_dk_report_period_key(fr.report_period)
      END DESC NULLS LAST,
      fr.uploaded_at DESC
  )
  SELECT
    c.id AS company_id,
    c.name AS company_name,
    c.logo_url,
    (lr.id IS NOT NULL) AS has_report,
    (lr._source IN ('manual', 'canonical')) AS has_verified_metrics,
    lr.id AS latest_report_id,
    lr._eff_period_label AS effective_period_label,
    lr._eff_period_key AS effective_period_key,
    CASE lr._source
      WHEN 'manual' THEN (lr.manual_normalized_data -> 'metrics' ->> 'omsaetning')::numeric
      WHEN 'canonical' THEN (lr.normalized_data -> 'metrics' ->> 'revenue')::numeric
      ELSE NULL
    END AS revenue,
    CASE lr._source
      WHEN 'manual' THEN (lr.manual_normalized_data -> 'metrics' ->> 'bruttofortjeneste')::numeric
      WHEN 'canonical' THEN (lr.normalized_data -> 'metrics' ->> 'gross_profit')::numeric
      ELSE NULL
    END AS gross_profit,
    CASE lr._source
      WHEN 'manual' THEN (lr.manual_normalized_data -> 'metrics' ->> 'resultat_foer_skat')::numeric
      WHEN 'canonical' THEN (lr.normalized_data -> 'metrics' ->> 'ebt')::numeric
      ELSE NULL
    END AS ebt,
    CASE lr._source
      WHEN 'manual' THEN (lr.manual_normalized_data -> 'metrics' ->> 'likvider')::numeric
      WHEN 'canonical' THEN (lr.normalized_data -> 'metrics' ->> 'cash')::numeric
      ELSE NULL
    END AS cash,
    CASE
      WHEN lr.id IS NULL THEN true
      WHEN lr._eff_period_key IS NULL THEN true
      WHEN lr._eff_period_key < to_char(now() - interval '1 month', 'YYYY-MM') THEN true
      ELSE false
    END AS missing_current_period
  FROM group_cos gc
  INNER JOIN companies c ON c.id = gc.company_id
  LEFT JOIN latest_reports lr ON lr.company_id = gc.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_financial_summary_for_advisor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_financial_summary_for_advisor(uuid) TO authenticated;
