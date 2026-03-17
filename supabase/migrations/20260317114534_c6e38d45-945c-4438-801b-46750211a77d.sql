
-- Admin RPC: list all groups with counts (SECURITY DEFINER, admin-only)
CREATE OR REPLACE FUNCTION public.get_admin_group_list()
RETURNS TABLE (
  group_id uuid,
  group_name text,
  anchor_company_id uuid,
  anchor_company_name text,
  company_count bigint,
  member_count bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: not an admin';
  END IF;

  RETURN QUERY
  SELECT
    g.id AS group_id,
    g.name AS group_name,
    g.anchor_company_id,
    c.name AS anchor_company_name,
    COALESCE(gc_count.cnt, 0) AS company_count,
    COALESCE(gm_count.cnt, 0) AS member_count,
    g.created_at
  FROM groups g
  INNER JOIN companies c ON c.id = g.anchor_company_id
  LEFT JOIN (
    SELECT gc.group_id, COUNT(*)::bigint AS cnt
    FROM group_companies gc
    GROUP BY gc.group_id
  ) gc_count ON gc_count.group_id = g.id
  LEFT JOIN (
    SELECT gm.group_id, COUNT(*)::bigint AS cnt
    FROM group_memberships gm
    GROUP BY gm.group_id
  ) gm_count ON gm_count.group_id = g.id
  ORDER BY g.created_at DESC;
END;
$$;

-- Admin RPC: group financial summary (SECURITY DEFINER, admin-only, no advisor access check)
CREATE OR REPLACE FUNCTION public.get_group_financial_summary_for_admin(p_group_id uuid)
RETURNS TABLE (
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
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: not an admin';
  END IF;

  RETURN QUERY
  WITH group_cos AS (
    SELECT gc.company_id
    FROM group_companies gc
    WHERE gc.group_id = p_group_id
  )
  SELECT
    co.id AS company_id,
    co.name AS company_name,
    co.logo_url,
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
    END AS missing_current_period
  FROM group_cos gc_inner
  INNER JOIN companies co ON co.id = gc_inner.company_id
  LEFT JOIN LATERAL (
    SELECT frf.id, frf.source_report_id, frf.period_label, frf.period_key, frf.metrics
    FROM financial_report_facts frf
    WHERE frf.company_id = gc_inner.company_id
    ORDER BY frf.period_key DESC
    LIMIT 1
  ) f ON true;
END;
$$;
