ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS intro_reminder_last_sent_at timestamptz NULL;

COMMENT ON COLUMN public.companies.intro_reminder_last_sent_at IS
  'Tidspunkt for seneste intro-session-paamindelse. NULL = aldrig sendt.';
