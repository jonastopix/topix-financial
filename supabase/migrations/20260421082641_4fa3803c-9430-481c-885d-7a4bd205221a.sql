ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contract_start_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contract_end_date date DEFAULT NULL;

COMMENT ON COLUMN public.companies.contract_start_date IS 'Start of The Boardroom membership contract';
COMMENT ON COLUMN public.companies.contract_end_date IS 'End of The Boardroom membership contract — access expires after this date';