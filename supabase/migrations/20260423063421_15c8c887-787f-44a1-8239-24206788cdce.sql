-- Forhindr dubletter af facts for samme virksomhed/periode/kildetype
CREATE UNIQUE INDEX IF NOT EXISTS uniq_facts_company_period_source 
  ON public.financial_report_facts (company_id, period_key, source_type);