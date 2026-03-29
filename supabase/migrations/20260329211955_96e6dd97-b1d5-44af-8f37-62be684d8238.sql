INSERT INTO public.industry_benchmarks
  (industry_code, industry_label, kpi_key, benchmark_value, benchmark_label, benchmark_min, benchmark_max)
VALUES
  ('travel', 'Rejse og turisme', 'gross_margin_pct', 30, '20-40% for rejsebranchen', 20, 40),
  ('travel', 'Rejse og turisme', 'ebitda_margin_pct', 8, '4-12% for rejsebranchen', 4, 12),
  ('travel_tour', 'Rejsebureau og turoperatør', 'gross_margin_pct', 28, '18-38% for rejsebureau', 18, 38),
  ('travel_tour', 'Rejsebureau og turoperatør', 'ebitda_margin_pct', 7, '3-11% for rejsebureau', 3, 11),
  ('travel_event', 'Eventrejser og specialture', 'gross_margin_pct', 35, '25-45% for eventrejser', 25, 45),
  ('travel_event', 'Eventrejser og specialture', 'ebitda_margin_pct', 10, '5-15% for eventrejser', 5, 15),
  ('health_optician', 'Optiker og synspleje', 'gross_margin_pct', 48, '38-58% for optiker', 38, 58),
  ('health_optician', 'Optiker og synspleje', 'ebitda_margin_pct', 11, '6-16% for optiker', 6, 16)
ON CONFLICT (industry_code, kpi_key) DO NOTHING;