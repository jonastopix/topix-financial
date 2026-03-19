-- Rename existing email_send_log to preserve historical data
-- setup_email_infra will create a new email_send_log with the expected schema
ALTER TABLE public.email_send_log RENAME TO email_send_log_legacy;

-- Drop FK constraint on the legacy table so it doesn't interfere
ALTER TABLE public.email_send_log_legacy DROP CONSTRAINT IF EXISTS email_send_log_template_id_fkey;