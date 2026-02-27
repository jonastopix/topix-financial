-- Delete stuck "processing" reports from first attempt
DELETE FROM public.financial_reports 
WHERE id IN (
  'c3d48804-d568-4060-a77b-4599bf0ecdd6',
  '3beebc01-e583-4035-96f1-37debf505298',
  '3aede303-575f-486c-8d68-eaddabe38a77',
  '9f0f7811-c4b8-4032-952a-f1094081b863',
  'a1119bc9-f12a-4ee9-a37a-ee78a4427afb'
);

-- Fix wrong period: Resultatopgørelse (1) = August 2025, not December 2023
UPDATE public.financial_reports 
SET report_period = 'August 2025'
WHERE id = 'fd1cfc3d-7ad7-4598-8391-bd7e8a33a3ef';

-- Fix wrong period: Resultatopgørelse (2) = September 2025, not Oktober 2025
UPDATE public.financial_reports 
SET report_period = 'September 2025'
WHERE id = 'd52c29e1-e632-4a66-abe1-d99e384e1768';