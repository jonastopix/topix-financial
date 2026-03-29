-- Backfill industry_code + industry_label on all existing Boardroom members
-- Matched by CVR number. Members not yet on platform are simply skipped (no match = no update).

UPDATE public.companies SET industry_code = 'finance_general',        industry_label = 'Finans og forsikring'            WHERE cvr_number = '44209764';
UPDATE public.companies SET industry_code = 'travel_tour',            industry_label = 'Rejsebureau og turoperatør'      WHERE cvr_number = '44665573';
UPDATE public.companies SET industry_code = 'trades_other',           industry_label = 'Anden håndværksservice'          WHERE cvr_number = '20100397';
UPDATE public.companies SET industry_code = 'consulting_finance',     industry_label = 'Økonomi og regnskab'             WHERE cvr_number = '39929058';
UPDATE public.companies SET industry_code = 'retail_other',           industry_label = 'Anden detailhandel'              WHERE cvr_number = '44435314';
UPDATE public.companies SET industry_code = 'tech_support',           industry_label = 'IT-drift og support'             WHERE cvr_number = '43894854';
UPDATE public.companies SET industry_code = 'retail_sport',           industry_label = 'Sport og fritid'                 WHERE cvr_number = '25295366';
UPDATE public.companies SET industry_code = 'trades_electrical',      industry_label = 'El, VVS og ventilation'          WHERE cvr_number = '33773137';
UPDATE public.companies SET industry_code = 'retail_automotive',      industry_label = 'Biler og køretøjer'              WHERE cvr_number = '32368492';
UPDATE public.companies SET industry_code = 'wholesale_general',      industry_label = 'Engroshandel og import/eksport'  WHERE cvr_number = '40760547';
UPDATE public.companies SET industry_code = 'tech_startup',           industry_label = 'Tech-startup'                   WHERE cvr_number = '45163814';
UPDATE public.companies SET industry_code = 'retail_fashion',         industry_label = 'Tøj og accessories'              WHERE cvr_number = '38704656';
UPDATE public.companies SET industry_code = 'health_clinic',          industry_label = 'Klinik og behandling'            WHERE cvr_number = '36013893';
UPDATE public.companies SET industry_code = 'food_restaurant',        industry_label = 'Restaurant og café'              WHERE cvr_number = '38914685';
UPDATE public.companies SET industry_code = 'transport_freight',      industry_label = 'Varetransport og spedition'      WHERE cvr_number = '28334060';
UPDATE public.companies SET industry_code = 'trades_electrical',      industry_label = 'El, VVS og ventilation'          WHERE cvr_number = '38743678';
UPDATE public.companies SET industry_code = 'tech_support',           industry_label = 'IT-drift og support'             WHERE cvr_number = '40065997';
UPDATE public.companies SET industry_code = 'health_optician',        industry_label = 'Optiker og synspleje'            WHERE cvr_number = '42956376';
UPDATE public.companies SET industry_code = 'food_restaurant',        industry_label = 'Restaurant og café'              WHERE cvr_number = '44633361';
UPDATE public.companies SET industry_code = 'consulting_management',  industry_label = 'Management og strategi'          WHERE cvr_number = '39930129';
UPDATE public.companies SET industry_code = 'retail_furniture',       industry_label = 'Møbler og interiør'              WHERE cvr_number = '45252264';
UPDATE public.companies SET industry_code = 'retail_furniture',       industry_label = 'Møbler og interiør'              WHERE cvr_number = '39199971';
UPDATE public.companies SET industry_code = 'health_clinic',          industry_label = 'Klinik og behandling'            WHERE cvr_number = '35854746';
UPDATE public.companies SET industry_code = 'wholesale_general',      industry_label = 'Engroshandel og import/eksport'  WHERE cvr_number = '41399570';
UPDATE public.companies SET industry_code = 'retail_electronics',     industry_label = 'Elektronik og IT-udstyr'         WHERE cvr_number = '13963843';
UPDATE public.companies SET industry_code = 'retail_other',           industry_label = 'Anden detailhandel'              WHERE cvr_number = '25897773';
UPDATE public.companies SET industry_code = 'production_industrial',  industry_label = 'Industriel produktion'           WHERE cvr_number = '38367986';
UPDATE public.companies SET industry_code = 'travel_event',           industry_label = 'Eventrejser og specialture'      WHERE cvr_number = '42578584';
UPDATE public.companies SET industry_code = 'construction_contractor',industry_label = 'Entreprenør og anlæg'            WHERE cvr_number = '45896145';
UPDATE public.companies SET industry_code = 'retail_other',           industry_label = 'Anden detailhandel'              WHERE cvr_number = '34483647';
UPDATE public.companies SET industry_code = 'construction_contractor',industry_label = 'Entreprenør og anlæg'            WHERE cvr_number = '45924009';
UPDATE public.companies SET industry_code = 'consulting_finance',     industry_label = 'Økonomi og regnskab'             WHERE cvr_number = '39434369';
UPDATE public.companies SET industry_code = 'food_restaurant',        industry_label = 'Restaurant og café'              WHERE cvr_number = '38152459';
UPDATE public.companies SET industry_code = 'wholesale_general',      industry_label = 'Engroshandel og import/eksport'  WHERE cvr_number = '28565496';
UPDATE public.companies SET industry_code = 'production_industrial',  industry_label = 'Industriel produktion'           WHERE cvr_number = '34541507';
UPDATE public.companies SET industry_code = 'tech_startup',           industry_label = 'Tech-startup'                   WHERE cvr_number = '38242563';
UPDATE public.companies SET industry_code = 'retail_other',           industry_label = 'Anden detailhandel'              WHERE cvr_number = '28999291';

-- Sync kpi_benchmarks for companies that now have industry_code set
-- Uses ON CONFLICT to skip if benchmark already exists for that company+kpi_key
INSERT INTO public.kpi_benchmarks (company_id, user_id, kpi_key, benchmark_value, benchmark_label, source_label)
SELECT c.id, cm.user_id, ib.kpi_key, ib.benchmark_value, ib.benchmark_label, ib.source_label
FROM public.companies c
JOIN public.industry_benchmarks ib ON ib.industry_code = c.industry_code
JOIN public.company_members cm ON cm.company_id = c.id
WHERE c.cvr_number IN (
  '44209764','44665573','20100397','39929058','44435314','43894854','25295366',
  '33773137','32368492','40760547','45163814','38704656','36013893','38914685',
  '28334060','38743678','40065997','42956376','44633361','39930129','45252264',
  '39199971','35854746','41399570','13963843','25897773','38367986','42578584',
  '45896145','34483647','45924009','39434369','38152459','28565496','34541507',
  '38242563','28999291'
)
ON CONFLICT (company_id, kpi_key) DO NOTHING;