
-- Create advisor_session_notes table for caching AI-generated session prep notes
CREATE TABLE public.advisor_session_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  generated_by uuid NOT NULL,
  note_text text NOT NULL DEFAULT '',
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.advisor_session_notes ENABLE ROW LEVEL SECURITY;

-- Only advisors can read session notes
CREATE POLICY "Advisors can view session notes"
  ON public.advisor_session_notes FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- Only advisors can insert session notes
CREATE POLICY "Advisors can insert session notes"
  ON public.advisor_session_notes FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'advisor'::app_role) AND generated_by = auth.uid());

-- Only advisors can delete session notes
CREATE POLICY "Advisors can delete session notes"
  ON public.advisor_session_notes FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- Index for fast lookup by company
CREATE INDEX idx_advisor_session_notes_company ON public.advisor_session_notes (company_id, generated_at DESC);
