-- Phase A1: Add V2 extraction contract version + quality signals columns
ALTER TABLE public.financial_reports
  ADD COLUMN extraction_contract_version text NOT NULL DEFAULT 'v1';

ALTER TABLE public.financial_reports
  ADD COLUMN quality_signals jsonb;