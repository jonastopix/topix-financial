
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  sender_name text NOT NULL DEFAULT 'The Boardroom',
  sender_email text NOT NULL DEFAULT 'noreply@boardroom.topix.dk',
  trigger_type text NOT NULL DEFAULT 'manual',
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can select email templates"
  ON public.email_templates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can insert email templates"
  ON public.email_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update email templates"
  ON public.email_templates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete email templates"
  ON public.email_templates FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
