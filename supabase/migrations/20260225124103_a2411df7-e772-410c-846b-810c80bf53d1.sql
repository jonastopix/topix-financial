-- Add logo_url to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url text DEFAULT null;

-- Create public bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own company folder
CREATE POLICY "Company members can upload logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (public.user_company_id(auth.uid()))::text
);

-- Allow authenticated users to update their own company logos
CREATE POLICY "Company members can update logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (public.user_company_id(auth.uid()))::text
);

-- Allow authenticated users to delete their own company logos
CREATE POLICY "Company members can delete logos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (public.user_company_id(auth.uid()))::text
);

-- Anyone can view company logos (public bucket)
CREATE POLICY "Anyone can view company logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'company-logos');