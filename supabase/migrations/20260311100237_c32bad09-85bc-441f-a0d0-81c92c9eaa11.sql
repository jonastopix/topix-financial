
-- Step 1: Deduplicate kpi_targets — keep most recently updated row per (company_id, kpi_key)
DELETE FROM public.kpi_targets
WHERE id NOT IN (
  SELECT DISTINCT ON (company_id, kpi_key) id
  FROM public.kpi_targets
  ORDER BY company_id, kpi_key, updated_at DESC
);

-- Step 2: Deduplicate kpi_benchmarks — keep most recently updated row per (company_id, kpi_key)
DELETE FROM public.kpi_benchmarks
WHERE id NOT IN (
  SELECT DISTINCT ON (company_id, kpi_key) id
  FROM public.kpi_benchmarks
  ORDER BY company_id, kpi_key, updated_at DESC
);

-- Step 3: Drop old user-level unique constraints
ALTER TABLE public.kpi_targets DROP CONSTRAINT IF EXISTS kpi_targets_user_id_kpi_key_key;
ALTER TABLE public.kpi_benchmarks DROP CONSTRAINT IF EXISTS kpi_benchmarks_user_id_kpi_key_key;

-- Step 4: Add company-level unique constraints
ALTER TABLE public.kpi_targets ADD CONSTRAINT kpi_targets_company_id_kpi_key_key UNIQUE (company_id, kpi_key);
ALTER TABLE public.kpi_benchmarks ADD CONSTRAINT kpi_benchmarks_company_id_kpi_key_key UNIQUE (company_id, kpi_key);
