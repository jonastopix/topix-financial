
-- Create feedback table
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  category text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND company_id = user_company_id(auth.uid())
  );

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Company members can view company feedback
CREATE POLICY "Company members can view company feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (company_id = user_company_id(auth.uid()));

-- Advisors can view all feedback
CREATE POLICY "Advisors can view all feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- Advisors can update all feedback (status, admin_note)
CREATE POLICY "Advisors can update all feedback"
  ON public.feedback FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- Advisors can delete feedback
CREATE POLICY "Advisors can delete feedback"
  ON public.feedback FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));
