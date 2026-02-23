
-- Create storage bucket for financial documents
INSERT INTO storage.buckets (id, name, public) VALUES ('financial-documents', 'financial-documents', false);

-- Storage policies
CREATE POLICY "Authenticated users can upload financial documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'financial-documents');

CREATE POLICY "Users can view their own financial documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'financial-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own financial documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'financial-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Table for uploaded financial reports with extracted data
CREATE TABLE public.financial_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('saldobalance', 'resultatopgørelse', 'andet')),
  report_period TEXT, -- e.g. "Oktober 2025"
  company_name TEXT,
  cvr_number TEXT,
  extracted_data JSONB, -- all extracted key figures
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed'))
);

ALTER TABLE public.financial_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports"
ON public.financial_reports FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports"
ON public.financial_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports"
ON public.financial_reports FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports"
ON public.financial_reports FOR DELETE TO authenticated
USING (auth.uid() = user_id);
