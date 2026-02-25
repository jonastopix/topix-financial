
CREATE UNIQUE INDEX IF NOT EXISTS companies_cvr_number_unique ON public.companies (cvr_number) WHERE cvr_number IS NOT NULL AND cvr_number != '';
