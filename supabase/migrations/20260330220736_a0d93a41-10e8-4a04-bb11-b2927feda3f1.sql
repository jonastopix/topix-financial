
DROP FUNCTION IF EXISTS public.get_my_group_financial_summary();
DROP FUNCTION IF EXISTS public.get_group_financial_summary_for_advisor(uuid);

CREATE FUNCTION public.get_my_group_financial_summary()
RETURNS TABLE(
  company_id uuid, company_name text, logo_url text,
  has_report boolean, has_verified_metrics boolean,
  latest_report_id uuid, effective_period_label text, effective_period_key text,
  revenue numeric, gross_profit numeric, ebt numeric, cash numeric,
  missing_current_period boolean, revenue_prev numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH group_cos AS (
    SELECT gc.company_id
    FROM group_companies gc
    WHERE gc.group_id = user_group_id(auth.uid())
  )
  SELECT
    c.id AS company_id,
    c.name AS company_name,
    c.logo_url,
    (f.id IS NOT NULL) AS has_report,
    (f.id IS NOT NULL) AS has_verified_metrics,
    f.source_report_id AS latest_report_id,
    f.period_label AS effective_period_label,
    f.period_key AS effective_period_key,
    (f.metrics->>'revenue')::numeric AS revenue,
    (f.metrics->>'gross_profit')::numeric AS gross_profit,
    (f.metrics->>'ebt')::numeric AS ebt,
    (f.metrics->>'cash')::numeric AS cash,
    CASE
      WHEN f.id IS NULL THEN true
      WHEN f.period_key IS NULL THEN true
      WHEN f.period_key < to_char(now() - interval '1 month', 'YYYY-MM') THEN true
      ELSE false
    END AS missing_current_period,
    (prev.metrics->>'revenue')::numeric AS revenue_prev
  FROM group_cos gc
  INNER JOIN companies c ON c.id = gc.company_id
  LEFT JOIN LATERAL (
    SELECT frf.id, frf.source_report_id, frf.period_label, frf.period_key, frf.metrics
    FROM financial_report_facts frf
    WHERE frf.company_id = gc.company_id
    ORDER BY frf.period_key DESC LIMIT 1
  ) f ON true
  LEFT JOIN LATERAL (
    SELECT frf.metrics
    FROM financial_report_facts frf
    WHERE frf.company_id = gc.company_id AND frf.period_key < f.period_key
    ORDER BY frf.period_key DESC LIMIT 1
  ) prev ON f.id IS NOT NULL;
$$;

CREATE FUNCTION public.get_group_financial_summary_for_advisor(p_group_id uuid)
RETURNS TABLE(
  company_id uuid, company_name text, logo_url text,
  has_report boolean, has_verified_metrics boolean,
  latest_report_id uuid, effective_period_label text, effective_period_key text,
  revenue numeric, gross_profit numeric, ebt numeric, cash numeric,
  missing_current_period boolean, revenue_prev numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
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
  )
  SELECT
    c.id AS company_id,
    c.name AS company_name,
    c.logo_url,
    (f.id IS NOT NULL) AS has_report,
    (f.id IS NOT NULL) AS has_verified_metrics,
    f.source_report_id AS latest_report_id,
    f.period_label AS effective_period_label,
    f.period_key AS effective_period_key,
    (f.metrics->>'revenue')::numeric AS revenue,
    (f.metrics->>'gross_profit')::numeric AS gross_profit,
    (f.metrics->>'ebt')::numeric AS ebt,
    (f.metrics->>'cash')::numeric AS cash,
    CASE
      WHEN f.id IS NULL THEN true
      WHEN f.period_key IS NULL THEN true
      WHEN f.period_key < to_char(now() - interval '1 month', 'YYYY-MM') THEN true
      ELSE false
    END AS missing_current_period,
    (prev.metrics->>'revenue')::numeric AS revenue_prev
  FROM group_cos gc
  INNER JOIN companies c ON c.id = gc.company_id
  LEFT JOIN LATERAL (
    SELECT frf.id, frf.source_report_id, frf.period_label, frf.period_key, frf.metrics
    FROM financial_report_facts frf
    WHERE frf.company_id = gc.company_id
    ORDER BY frf.period_key DESC LIMIT 1
  ) f ON true
  LEFT JOIN LATERAL (
    SELECT frf.metrics
    FROM financial_report_facts frf
    WHERE frf.company_id = gc.company_id AND frf.period_key < f.period_key
    ORDER BY frf.period_key DESC LIMIT 1
  ) prev ON f.id IS NOT NULL;
END;
$$;
