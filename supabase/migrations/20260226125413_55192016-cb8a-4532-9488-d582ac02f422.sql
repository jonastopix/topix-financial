ALTER TABLE public.profiles ADD COLUMN onboarded_at timestamptz DEFAULT NULL;

-- Backfill existing profiles so they skip onboarding
UPDATE public.profiles SET onboarded_at = now() WHERE onboarded_at IS NULL;