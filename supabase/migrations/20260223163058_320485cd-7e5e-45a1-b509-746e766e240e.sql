-- Drop old check constraint that blocks 'processed' status
ALTER TABLE public.financial_reports DROP CONSTRAINT IF EXISTS financial_reports_status_check;

-- Add updated constraint allowing all valid statuses
ALTER TABLE public.financial_reports ADD CONSTRAINT financial_reports_status_check 
  CHECK (status IN ('processing', 'processed', 'error'));

-- Fix the stuck report
UPDATE public.financial_reports SET status = 'error' WHERE status = 'processing' AND processed_at IS NULL AND uploaded_at < now() - interval '5 minutes';