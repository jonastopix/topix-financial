UPDATE public.financial_report_facts 
SET metrics = jsonb_set(metrics, '{revenue}', '999999')
WHERE id = 'b75c4724-29b3-4d4d-9766-0d3b4e629a73';