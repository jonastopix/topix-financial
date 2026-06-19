-- Tilfoej felt der registrerer om virksomheden har brugt sin gratis intro-session (med Morten).
-- Per virksomhed. NULL = ikke brugt; en timestamp = brugt (og hvornaar).
-- Saettes af admin-markering (etape 1b) eller af en fremtidig gratis booking (senere).
-- Nullable uden default, saa eksisterende virksomheder bliver NULL = ikke brugt (korrekt udgangspunkt).
-- Ingen RLS-aendring noedvendig: "Advisors can update all companies" daekker, og admin arver advisor.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS intro_session_used_at timestamptz NULL;

COMMENT ON COLUMN public.companies.intro_session_used_at IS
  'Tidspunkt hvor virksomhedens gratis intro-session (Morten) blev brugt. NULL = ikke brugt. Saettes af admin-markering eller en gratis booking.';
