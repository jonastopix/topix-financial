
-- Create login log table
CREATE TABLE public.user_login_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  logged_in_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

-- Enable RLS
ALTER TABLE public.user_login_log ENABLE ROW LEVEL SECURITY;

-- Only advisors can read
CREATE POLICY "Advisors can view all login logs"
ON public.user_login_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'advisor'::app_role));

-- Security definer function to log logins (bypasses RLS)
CREATE OR REPLACE FUNCTION public.log_user_login()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.user_login_log (user_id) VALUES (auth.uid());
$$;
