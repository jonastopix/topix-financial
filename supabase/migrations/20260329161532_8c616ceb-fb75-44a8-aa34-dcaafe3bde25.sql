ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS industry_code text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS industry_label text;

-- Migrate existing free-text industry to industry_label where industry_code is not yet set
UPDATE public.companies 
SET industry_label = industry 
WHERE industry IS NOT NULL AND industry != '' AND industry_code IS NULL;