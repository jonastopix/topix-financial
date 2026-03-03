
-- Add deleted_at column for soft-delete
ALTER TABLE public.financial_reports
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Add index for efficient filtering
CREATE INDEX idx_financial_reports_deleted_at ON public.financial_reports (deleted_at)
WHERE deleted_at IS NULL;
