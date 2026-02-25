-- First update any existing NULL company_id rows using the user's company
UPDATE public.financial_reports SET company_id = public.user_company_id(user_id) WHERE company_id IS NULL;
UPDATE public.handouts SET company_id = public.user_company_id(user_id) WHERE company_id IS NULL;
UPDATE public.milestones SET company_id = public.user_company_id(user_id) WHERE company_id IS NULL;
UPDATE public.budget_targets SET company_id = public.user_company_id(user_id) WHERE company_id IS NULL;
UPDATE public.kpi_targets SET company_id = public.user_company_id(user_id) WHERE company_id IS NULL;
UPDATE public.kpi_benchmarks SET company_id = public.user_company_id(user_id) WHERE company_id IS NULL;

-- Now make company_id NOT NULL
ALTER TABLE public.financial_reports ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.handouts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.milestones ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.budget_targets ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.kpi_targets ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.kpi_benchmarks ALTER COLUMN company_id SET NOT NULL;