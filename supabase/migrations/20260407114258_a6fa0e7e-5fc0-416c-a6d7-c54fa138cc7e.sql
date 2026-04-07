CREATE TABLE public.session_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT,
  amount_dkk INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'booking_sent', 'booked', 'cancelled', 'refunded')),
  calendly_booking_url TEXT,
  calendly_event_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.session_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own session bookings"
  ON public.session_bookings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all session bookings"
  ON public.session_bookings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage session bookings"
  ON public.session_bookings FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER update_session_bookings_updated_at
  BEFORE UPDATE ON public.session_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();