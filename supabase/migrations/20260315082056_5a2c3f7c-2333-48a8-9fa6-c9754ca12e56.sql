
-- Helper: parse Danish report period string to YYYY-MM key
CREATE OR REPLACE FUNCTION public.parse_dk_report_period_key(_period text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _period IS NULL THEN NULL
    ELSE (
      SELECT
        CASE
          WHEN _month IS NOT NULL AND _year IS NOT NULL
          THEN _year || '-' || lpad(_month::text, 2, '0')
          ELSE NULL
        END
      FROM (
        SELECT
          CASE lower(split_part(trim(_period), ' ', 1))
            WHEN 'januar' THEN 1
            WHEN 'februar' THEN 2
            WHEN 'marts' THEN 3
            WHEN 'april' THEN 4
            WHEN 'maj' THEN 5
            WHEN 'juni' THEN 6
            WHEN 'juli' THEN 7
            WHEN 'august' THEN 8
            WHEN 'september' THEN 9
            WHEN 'oktober' THEN 10
            WHEN 'november' THEN 11
            WHEN 'december' THEN 12
            ELSE NULL
          END AS _month,
          CASE
            WHEN split_part(trim(_period), ' ', 2) ~ '^\d{4}$'
            THEN split_part(trim(_period), ' ', 2)
            ELSE NULL
          END AS _year
      ) AS parts
    )
  END
$$;

-- Lock down parse_dk_report_period_key
REVOKE EXECUTE ON FUNCTION public.parse_dk_report_period_key(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.parse_dk_report_period_key(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.parse_dk_report_period_key(text) TO authenticated;

-- Main RPC: get_my_group_financial_summary
CREATE OR REPLACE FUNCTION public.get_my_group_financial_summary()
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH group_cos AS (
    SELECT gc.company_id
    FROM group_companies gc
    WHERE gc.group_id = user_group_id(auth.uid())
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
      -- Determine single authoritative source
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
      -- Effective period key: source-consistent
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
    -- All metrics from single source
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
    -- missing_current_period with NULL safety
    CASE
      WHEN lr.id IS NULL THEN true
      WHEN lr._eff_period_key IS NULL THEN true
      WHEN lr._eff_period_key < to_char(now() - interval '1 month', 'YYYY-MM') THEN true
      ELSE false
    END AS missing_current_period
  FROM group_cos gc
  INNER JOIN companies c ON c.id = gc.company_id
  LEFT JOIN latest_reports lr ON lr.company_id = gc.company_id;
$$;

-- Lock down get_my_group_financial_summary
REVOKE EXECUTE ON FUNCTION public.get_my_group_financial_summary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_group_financial_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_group_financial_summary() TO authenticated;
