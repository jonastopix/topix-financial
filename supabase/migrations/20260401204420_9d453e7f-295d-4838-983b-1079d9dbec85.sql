
UPDATE public.companies SET name = 'The Boardroom ApS' WHERE id = 'a0de0000-0000-4000-8000-000000000001';
UPDATE public.profiles SET full_name = 'Morten Larsen', company_name = 'The Boardroom ApS' WHERE email = 'demo@theboardroom.dk';
DELETE FROM public.financial_reports WHERE file_path = 'demo/seed.csv';
