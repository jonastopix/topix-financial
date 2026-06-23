ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.email_send_log.subject IS
  'Emnelinjen paa den sendte mail. NULL hvis ikke registreret.';
COMMENT ON COLUMN public.email_send_log.is_test IS
  'True hvis raekken stammer fra en testafsendelse (fx admin "Send test"). Default false.';
