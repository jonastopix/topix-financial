
ALTER TABLE public.financial_reports
  ADD COLUMN IF NOT EXISTS manual_report_period_label text,
  ADD COLUMN IF NOT EXISTS manual_report_period_key text
    CHECK (manual_report_period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  ADD COLUMN IF NOT EXISTS manual_report_type text,
  ADD COLUMN IF NOT EXISTS manual_normalized_data jsonb,
  ADD COLUMN IF NOT EXISTS manual_override_note text,
  ADD COLUMN IF NOT EXISTS manual_override_by uuid,
  ADD COLUMN IF NOT EXISTS manual_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_override_source text
    CHECK (manual_override_source IN ('member', 'advisor', 'admin')),
  ADD COLUMN IF NOT EXISTS manual_override_status text
    CHECK (manual_override_status IN ('draft', 'applied'));
