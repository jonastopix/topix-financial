-- Index for fetching reports by company (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_financial_reports_company_id
  ON public.financial_reports (company_id);

-- Index for fetching active (non-deleted) reports by company  
CREATE INDEX IF NOT EXISTS idx_financial_reports_company_active
  ON public.financial_reports (company_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

-- Index for financial_report_facts by company (used by useCompanyFacts hook)
CREATE INDEX IF NOT EXISTS idx_financial_report_facts_company_id
  ON public.financial_report_facts (company_id);

-- Index for financial_report_facts by company + period (used by commit checks)
CREATE INDEX IF NOT EXISTS idx_financial_report_facts_company_period
  ON public.financial_report_facts (company_id, period_key);

-- Index for financial_report_facts by source_report (used by permanent delete)
CREATE INDEX IF NOT EXISTS idx_financial_report_facts_source_report
  ON public.financial_report_facts (source_report_id);