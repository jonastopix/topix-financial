CREATE TABLE IF NOT EXISTS public.circle_oauth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.circle_oauth_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage oauth codes"
  ON public.circle_oauth_codes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_circle_oauth_codes_code ON public.circle_oauth_codes(code);
CREATE INDEX idx_circle_oauth_codes_expires ON public.circle_oauth_codes(expires_at);

CREATE TABLE IF NOT EXISTS public.circle_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.circle_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage oauth tokens"
  ON public.circle_oauth_tokens FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_circle_oauth_tokens_token ON public.circle_oauth_tokens(token);
CREATE INDEX idx_circle_oauth_tokens_expires ON public.circle_oauth_tokens(expires_at);