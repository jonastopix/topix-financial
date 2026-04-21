ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS offboarding_requested_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.companies.subscription_status IS 'Stripe subscription status: active, cancelled, past_due, or NULL for contract members';
COMMENT ON COLUMN public.companies.stripe_customer_id IS 'Stripe customer ID for self-serve subscribers';
COMMENT ON COLUMN public.companies.stripe_subscription_id IS 'Stripe subscription ID for self-serve subscribers';
COMMENT ON COLUMN public.companies.subscription_current_period_end IS 'End of current Stripe billing period';
COMMENT ON COLUMN public.companies.offboarding_requested_at IS 'Timestamp when member requested data deletion / offboarding';