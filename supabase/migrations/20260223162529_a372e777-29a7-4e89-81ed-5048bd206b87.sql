-- Add ai_analysis JSONB column to store the full AI analysis result
ALTER TABLE public.financial_reports ADD COLUMN ai_analysis jsonb DEFAULT NULL;