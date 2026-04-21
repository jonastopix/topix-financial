-- Add application context fields to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS application_context jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cvr_fetched_at timestamptz DEFAULT NULL;

-- application_context stores the parsed application data:
-- {
--   current_situation: string,
--   goals: string,
--   help_needed: string,
--   annual_revenue: number | null,
--   application_date: string | null,
--   raw_cvr_data: object | null
-- }

-- onboarding_completed = false for new imports, true for existing companies
-- so the agent only runs onboarding once per company

-- Index for finding companies pending onboarding
CREATE INDEX IF NOT EXISTS idx_companies_onboarding_pending
  ON public.companies (onboarding_completed)
  WHERE onboarding_completed = false;

-- Add comment to document the columns
COMMENT ON COLUMN public.companies.application_context IS 'Stores parsed application data including current_situation, goals, help_needed, annual_revenue, application_date, and raw_cvr_data';
COMMENT ON COLUMN public.companies.onboarding_completed IS 'Tracks if company onboarding has been completed. False for new imports, true for existing companies';
COMMENT ON COLUMN public.companies.cvr_fetched_at IS 'Timestamp when CVR data was last fetched for this company';