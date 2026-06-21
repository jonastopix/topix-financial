-- Forbered session_bookings til (a) at skelne hvilken raadgiver en booking gaelder,
-- og (b) at tillade en gratis booking uden Stripe-betaling.

-- (a) Skeln raadgiver. Eksisterende rader var alle Jonas, saa default 'jonas' bevarer historik.
ALTER TABLE public.session_bookings
  ADD COLUMN IF NOT EXISTS advisor text NOT NULL DEFAULT 'jonas';

COMMENT ON COLUMN public.session_bookings.advisor IS
  'Hvilken raadgiver bookingen gaelder. Eksisterende og betalte bookinger er ''jonas''; gratis intro-session er ''morten''.';

-- (b) En gratis booking har ingen Stripe-session, saa stripe_session_id maa vaere NULL.
-- UNIQUE-constraintet bevares: Postgres behandler hver NULL som distinkt i et UNIQUE-indeks,
-- saa flere gratis-rader med NULL stripe_session_id giver ingen konflikt. Betalte bookinger
-- beholder deres unikke Stripe-session-id uaendret.
ALTER TABLE public.session_bookings
  ALTER COLUMN stripe_session_id DROP NOT NULL;
