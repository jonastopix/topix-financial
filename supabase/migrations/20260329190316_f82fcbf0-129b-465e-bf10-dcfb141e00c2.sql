
-- ═══════════════════════════════════════════════════════════════════
-- WEEKLY FOCUS FOUNDATION
-- Tables: industry_benchmarks, company_actions, weekly_focus
-- Flag: companies.weekly_focus_enabled
-- Data: branche-benchmarks for alle 16 brancher
-- ═══════════════════════════════════════════════════════════════════

-- ─── industry_benchmarks (global, ikke per company) ───────────────

CREATE TABLE IF NOT EXISTS public.industry_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_code TEXT NOT NULL,
  industry_label TEXT NOT NULL,
  kpi_key TEXT NOT NULL,
  benchmark_value NUMERIC NOT NULL,
  benchmark_label TEXT NOT NULL,
  benchmark_min NUMERIC NOT NULL,
  benchmark_max NUMERIC NOT NULL,
  source_label TEXT NOT NULL DEFAULT 'Branchestandard (The Boardroom)',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(industry_code, kpi_key)
);

ALTER TABLE public.industry_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read industry benchmarks"
  ON public.industry_benchmarks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage industry benchmarks"
  ON public.industry_benchmarks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_industry_benchmarks_code ON public.industry_benchmarks(industry_code);

CREATE TRIGGER set_industry_benchmarks_updated_at
  BEFORE UPDATE ON public.industry_benchmarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── company_actions ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  context TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('ai_weekly', 'milestone', 'handout', 'manual')),
  source_id UUID,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'done', 'parked', 'dismissed')),
  week_key TEXT,
  generated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.company_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own company actions"
  ON public.company_actions FOR SELECT
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Members can insert own company actions"
  ON public.company_actions FOR INSERT
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Members can update own company actions"
  ON public.company_actions FOR UPDATE
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Advisors can view all company actions"
  ON public.company_actions FOR SELECT
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage company actions"
  ON public.company_actions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_company_actions_company_status ON public.company_actions(company_id, status, created_at DESC);

CREATE INDEX idx_company_actions_week ON public.company_actions(company_id, week_key);

CREATE TRIGGER set_company_actions_updated_at
  BEFORE UPDATE ON public.company_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── weekly_focus ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.weekly_focus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'no_data'
    CHECK (status IN ('no_data', 'quiet', 'active')),
  triggers_fired JSONB NOT NULL DEFAULT '[]',
  trigger_data JSONB NOT NULL DEFAULT '{}',
  headline TEXT,
  summary TEXT,
  actions_generated INTEGER NOT NULL DEFAULT 0,
  data_freshness_days INTEGER,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '8 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, week_key)
);

ALTER TABLE public.weekly_focus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own weekly focus"
  ON public.weekly_focus FOR SELECT
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Advisors can view all weekly focus"
  ON public.weekly_focus FOR SELECT
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage weekly focus"
  ON public.weekly_focus FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_weekly_focus_company_week ON public.weekly_focus(company_id, week_key DESC);

-- ─── weekly_focus_enabled flag på companies ───────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS weekly_focus_enabled BOOLEAN NOT NULL DEFAULT false;

-- ─── Branche-benchmarks: gross_margin_pct og ebitda_margin_pct ────

INSERT INTO public.industry_benchmarks
  (industry_code, industry_label, kpi_key, benchmark_value, benchmark_label, benchmark_min, benchmark_max)
VALUES
  ('retail', 'Detailhandel', 'gross_margin_pct', 40, '30-50% for detailhandel', 30, 50),
  ('retail', 'Detailhandel', 'ebitda_margin_pct', 5.5, '3-8% for detailhandel', 3, 8),
  ('retail_grocery', 'Dagligvarer og fødevarer', 'gross_margin_pct', 32, '25-40% for dagligvarer', 25, 40),
  ('retail_grocery', 'Dagligvarer og fødevarer', 'ebitda_margin_pct', 4, '2-6% for dagligvarer', 2, 6),
  ('retail_fashion', 'Tøj og accessories', 'gross_margin_pct', 50, '40-60% for tøj og accessories', 40, 60),
  ('retail_fashion', 'Tøj og accessories', 'ebitda_margin_pct', 6, '3-9% for tøj', 3, 9),
  ('retail_furniture', 'Møbler og interiør', 'gross_margin_pct', 45, '35-55% for møbler og interiør', 35, 55),
  ('retail_furniture', 'Møbler og interiør', 'ebitda_margin_pct', 5.5, '3-8% for møbler', 3, 8),
  ('retail_electronics', 'Elektronik og IT-udstyr', 'gross_margin_pct', 22, '15-30% for elektronik', 15, 30),
  ('retail_electronics', 'Elektronik og IT-udstyr', 'ebitda_margin_pct', 4, '2-6% for elektronik', 2, 6),
  ('retail_sport', 'Sport og fritid', 'gross_margin_pct', 42, '35-50% for sport og fritid', 35, 50),
  ('retail_sport', 'Sport og fritid', 'ebitda_margin_pct', 5.5, '3-8% for sport', 3, 8),
  ('retail_automotive', 'Biler og køretøjer', 'gross_margin_pct', 18, '12-25% for biler og køretøjer', 12, 25),
  ('retail_automotive', 'Biler og køretøjer', 'ebitda_margin_pct', 3.5, '2-5% for biler', 2, 5),
  ('retail_other', 'Anden detailhandel', 'gross_margin_pct', 40, '30-50% for detailhandel', 30, 50),
  ('retail_other', 'Anden detailhandel', 'ebitda_margin_pct', 5.5, '3-8% for detailhandel', 3, 8),
  ('wholesale', 'Engroshandel', 'gross_margin_pct', 25, '15-35% for engroshandel', 15, 35),
  ('wholesale', 'Engroshandel', 'ebitda_margin_pct', 4, '2-6% for engroshandel', 2, 6),
  ('wholesale_general', 'Engroshandel og import/eksport', 'gross_margin_pct', 25, '15-35% for engroshandel', 15, 35),
  ('wholesale_general', 'Engroshandel og import/eksport', 'ebitda_margin_pct', 4, '2-6% for engroshandel', 2, 6),
  ('production', 'Produktion og fremstilling', 'gross_margin_pct', 30, '20-40% for produktion', 20, 40),
  ('production', 'Produktion og fremstilling', 'ebitda_margin_pct', 8.5, '5-12% for produktion', 5, 12),
  ('production_food', 'Fødevareproduktion', 'gross_margin_pct', 28, '20-36% for fødevareproduktion', 20, 36),
  ('production_food', 'Fødevareproduktion', 'ebitda_margin_pct', 7, '4-10% for fødevareproduktion', 4, 10),
  ('production_industrial', 'Industriel produktion', 'gross_margin_pct', 30, '20-40% for industriel produktion', 20, 40),
  ('production_industrial', 'Industriel produktion', 'ebitda_margin_pct', 9, '6-12% for industriel produktion', 6, 12),
  ('production_craft', 'Håndværksproduktion', 'gross_margin_pct', 40, '30-50% for håndværksproduktion', 30, 50),
  ('production_craft', 'Håndværksproduktion', 'ebitda_margin_pct', 9, '5-13% for håndværksproduktion', 5, 13),
  ('construction', 'Bygge og anlæg', 'gross_margin_pct', 25, '15-35% for bygge og anlæg', 15, 35),
  ('construction', 'Bygge og anlæg', 'ebitda_margin_pct', 5.5, '3-8% for bygge og anlæg', 3, 8),
  ('construction_contractor', 'Entreprenør og anlæg', 'gross_margin_pct', 20, '12-28% for entreprenør', 12, 28),
  ('construction_contractor', 'Entreprenør og anlæg', 'ebitda_margin_pct', 5, '3-7% for entreprenør', 3, 7),
  ('construction_craft', 'Håndværk og installation', 'gross_margin_pct', 35, '25-45% for håndværk', 25, 45),
  ('construction_craft', 'Håndværk og installation', 'ebitda_margin_pct', 7, '4-10% for håndværk', 4, 10),
  ('construction_consulting', 'Arkitektur og rådgivning', 'gross_margin_pct', 60, '50-70% for arkitektur', 50, 70),
  ('construction_consulting', 'Arkitektur og rådgivning', 'ebitda_margin_pct', 14, '8-20% for arkitektur', 8, 20),
  ('transport', 'Transport og logistik', 'gross_margin_pct', 30, '20-40% for transport', 20, 40),
  ('transport', 'Transport og logistik', 'ebitda_margin_pct', 8.5, '5-12% for transport', 5, 12),
  ('transport_freight', 'Varetransport og spedition', 'gross_margin_pct', 25, '18-32% for varetransport', 18, 32),
  ('transport_freight', 'Varetransport og spedition', 'ebitda_margin_pct', 7, '4-10% for varetransport', 4, 10),
  ('transport_passenger', 'Personbefordring', 'gross_margin_pct', 35, '25-45% for personbefordring', 25, 45),
  ('transport_passenger', 'Personbefordring', 'ebitda_margin_pct', 8, '5-11% for personbefordring', 5, 11),
  ('transport_event', 'Eventlogistik og specialtransport', 'gross_margin_pct', 40, '30-50% for eventlogistik', 30, 50),
  ('transport_event', 'Eventlogistik og specialtransport', 'ebitda_margin_pct', 10, '6-14% for eventlogistik', 6, 14),
  ('tech', 'IT og teknologi', 'gross_margin_pct', 62, '50-75% for IT og teknologi', 50, 75),
  ('tech', 'IT og teknologi', 'ebitda_margin_pct', 17, '10-25% for IT', 10, 25),
  ('tech_software', 'Softwareudvikling', 'gross_margin_pct', 68, '55-80% for software', 55, 80),
  ('tech_software', 'Softwareudvikling', 'ebitda_margin_pct', 18, '10-26% for software', 10, 26),
  ('tech_support', 'IT-drift og support', 'gross_margin_pct', 55, '45-65% for IT-drift', 45, 65),
  ('tech_support', 'IT-drift og support', 'ebitda_margin_pct', 14, '8-20% for IT-drift', 8, 20),
  ('tech_startup', 'Tech-startup', 'gross_margin_pct', 62, '45-80% for tech-startup', 45, 80),
  ('tech_startup', 'Tech-startup', 'ebitda_margin_pct', 10, '0-25% for tech-startup', 0, 25),
  ('consulting', 'Rådgivning og konsulentydelser', 'gross_margin_pct', 70, '60-80% for rådgivning', 60, 80),
  ('consulting', 'Rådgivning og konsulentydelser', 'ebitda_margin_pct', 25, '15-35% for rådgivning', 15, 35),
  ('consulting_finance', 'Økonomi og regnskab', 'gross_margin_pct', 70, '60-80% for økonomi og regnskab', 60, 80),
  ('consulting_finance', 'Økonomi og regnskab', 'ebitda_margin_pct', 25, '15-35% for økonomi', 15, 35),
  ('consulting_legal', 'Juridisk rådgivning', 'gross_margin_pct', 72, '62-82% for juridisk rådgivning', 62, 82),
  ('consulting_legal', 'Juridisk rådgivning', 'ebitda_margin_pct', 26, '16-36% for juridisk', 16, 36),
  ('consulting_management', 'Management og strategi', 'gross_margin_pct', 72, '62-82% for management', 62, 82),
  ('consulting_management', 'Management og strategi', 'ebitda_margin_pct', 27, '17-37% for management', 17, 37),
  ('consulting_hr', 'HR og rekruttering', 'gross_margin_pct', 65, '55-75% for HR og rekruttering', 55, 75),
  ('consulting_hr', 'HR og rekruttering', 'ebitda_margin_pct', 22, '12-32% for HR', 12, 32),
  ('consulting_marketing', 'Marketing og kommunikation', 'gross_margin_pct', 65, '55-75% for marketing', 55, 75),
  ('consulting_marketing', 'Marketing og kommunikation', 'ebitda_margin_pct', 20, '12-28% for marketing', 12, 28),
  ('health', 'Sundhed og velvære', 'gross_margin_pct', 52, '40-65% for sundhed', 40, 65),
  ('health', 'Sundhed og velvære', 'ebitda_margin_pct', 13, '8-18% for sundhed', 8, 18),
  ('health_clinic', 'Klinik og behandling', 'gross_margin_pct', 55, '42-68% for klinik', 42, 68),
  ('health_clinic', 'Klinik og behandling', 'ebitda_margin_pct', 14, '8-20% for klinik', 8, 20),
  ('health_fitness', 'Træning og fitness', 'gross_margin_pct', 55, '42-68% for fitness', 42, 68),
  ('health_fitness', 'Træning og fitness', 'ebitda_margin_pct', 13, '7-19% for fitness', 7, 19),
  ('health_pharmacy', 'Apotek og helse', 'gross_margin_pct', 35, '25-45% for apotek', 25, 45),
  ('health_pharmacy', 'Apotek og helse', 'ebitda_margin_pct', 8, '4-12% for apotek', 4, 12),
  ('food', 'Fødevarer og restauration', 'gross_margin_pct', 35, '25-45% for fødevarer', 25, 45),
  ('food', 'Fødevarer og restauration', 'ebitda_margin_pct', 5.5, '3-8% for restauration', 3, 8),
  ('food_restaurant', 'Restaurant og café', 'gross_margin_pct', 65, '55-75% for restaurant', 55, 75),
  ('food_restaurant', 'Restaurant og café', 'ebitda_margin_pct', 8, '4-12% for restaurant', 4, 12),
  ('food_catering', 'Catering og events', 'gross_margin_pct', 42, '32-52% for catering', 32, 52),
  ('food_catering', 'Catering og events', 'ebitda_margin_pct', 9, '5-13% for catering', 5, 13),
  ('food_takeaway', 'Takeaway og levering', 'gross_margin_pct', 60, '50-70% for takeaway', 50, 70),
  ('food_takeaway', 'Takeaway og levering', 'ebitda_margin_pct', 7, '3-11% for takeaway', 3, 11),
  ('trades', 'Håndværk og serviceerhverv', 'gross_margin_pct', 45, '35-55% for håndværk', 35, 55),
  ('trades', 'Håndværk og serviceerhverv', 'ebitda_margin_pct', 8.5, '5-12% for håndværk', 5, 12),
  ('trades_electrical', 'El, VVS og ventilation', 'gross_margin_pct', 42, '32-52% for el og VVS', 32, 52),
  ('trades_electrical', 'El, VVS og ventilation', 'ebitda_margin_pct', 8, '5-11% for el og VVS', 5, 11),
  ('trades_painter', 'Maler og gulv', 'gross_margin_pct', 45, '35-55% for maler', 35, 55),
  ('trades_painter', 'Maler og gulv', 'ebitda_margin_pct', 8, '5-11% for maler', 5, 11),
  ('trades_cleaning', 'Rengøring og facility', 'gross_margin_pct', 38, '28-48% for rengøring', 28, 48),
  ('trades_cleaning', 'Rengøring og facility', 'ebitda_margin_pct', 7, '4-10% for rengøring', 4, 10),
  ('trades_other', 'Anden håndværksservice', 'gross_margin_pct', 45, '35-55% for håndværk', 35, 55),
  ('trades_other', 'Anden håndværksservice', 'ebitda_margin_pct', 8, '5-11% for håndværk', 5, 11),
  ('realestate', 'Ejendom og bolig', 'gross_margin_pct', 70, '60-80% for ejendom', 60, 80),
  ('realestate', 'Ejendom og bolig', 'ebitda_margin_pct', 30, '20-40% for ejendom', 20, 40),
  ('realestate_agency', 'Ejendomsmægling', 'gross_margin_pct', 68, '55-80% for ejendomsmægling', 55, 80),
  ('realestate_agency', 'Ejendomsmægling', 'ebitda_margin_pct', 25, '15-35% for ejendomsmægling', 15, 35),
  ('realestate_rental', 'Udlejning og administration', 'gross_margin_pct', 75, '65-85% for udlejning', 65, 85),
  ('realestate_rental', 'Udlejning og administration', 'ebitda_margin_pct', 38, '28-48% for udlejning', 28, 48),
  ('realestate_development', 'Ejendomsudvikling', 'gross_margin_pct', 30, '20-40% for ejendomsudvikling', 20, 40),
  ('realestate_development', 'Ejendomsudvikling', 'ebitda_margin_pct', 18, '10-26% for ejendomsudvikling', 10, 26),
  ('creative', 'Medier og kreative erhverv', 'gross_margin_pct', 62, '50-75% for kreative erhverv', 50, 75),
  ('creative', 'Medier og kreative erhverv', 'ebitda_margin_pct', 17, '10-25% for kreative erhverv', 10, 25),
  ('creative_advertising', 'Reklame og design', 'gross_margin_pct', 65, '52-78% for reklame og design', 52, 78),
  ('creative_advertising', 'Reklame og design', 'ebitda_margin_pct', 18, '10-26% for reklame', 10, 26),
  ('creative_photo', 'Foto og video', 'gross_margin_pct', 60, '48-72% for foto og video', 48, 72),
  ('creative_photo', 'Foto og video', 'ebitda_margin_pct', 15, '8-22% for foto', 8, 22),
  ('creative_music', 'Musik og underholdning', 'gross_margin_pct', 55, '42-68% for musik', 42, 68),
  ('creative_music', 'Musik og underholdning', 'ebitda_margin_pct', 12, '5-19% for musik', 5, 19),
  ('education', 'Uddannelse og undervisning', 'gross_margin_pct', 65, '55-75% for uddannelse', 55, 75),
  ('education', 'Uddannelse og undervisning', 'ebitda_margin_pct', 15, '10-20% for uddannelse', 10, 20),
  ('education_general', 'Uddannelse og undervisning', 'gross_margin_pct', 65, '55-75% for uddannelse', 55, 75),
  ('education_general', 'Uddannelse og undervisning', 'ebitda_margin_pct', 15, '10-20% for uddannelse', 10, 20),
  ('agriculture', 'Landbrug, gartneri og natur', 'gross_margin_pct', 30, '20-40% for landbrug', 20, 40),
  ('agriculture', 'Landbrug, gartneri og natur', 'ebitda_margin_pct', 10, '5-15% for landbrug', 5, 15),
  ('agriculture_general', 'Landbrug, gartneri og natur', 'gross_margin_pct', 30, '20-40% for landbrug', 20, 40),
  ('agriculture_general', 'Landbrug, gartneri og natur', 'ebitda_margin_pct', 10, '5-15% for landbrug', 5, 15),
  ('finance', 'Finans og forsikring', 'gross_margin_pct', 72, '60-85% for finans', 60, 85),
  ('finance', 'Finans og forsikring', 'ebitda_margin_pct', 30, '20-40% for finans', 20, 40),
  ('finance_general', 'Finans og forsikring', 'gross_margin_pct', 72, '60-85% for finans', 60, 85),
  ('finance_general', 'Finans og forsikring', 'ebitda_margin_pct', 30, '20-40% for finans', 20, 40),
  ('other', 'Andet', 'gross_margin_pct', 40, '20-60% generelt', 20, 60),
  ('other', 'Andet', 'ebitda_margin_pct', 10, '3-20% generelt', 3, 20),
  ('other_general', 'Andet', 'gross_margin_pct', 40, '20-60% generelt', 20, 60),
  ('other_general', 'Andet', 'ebitda_margin_pct', 10, '3-20% generelt', 3, 20)
ON CONFLICT (industry_code, kpi_key) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  benchmark_label = EXCLUDED.benchmark_label,
  benchmark_min = EXCLUDED.benchmark_min,
  benchmark_max = EXCLUDED.benchmark_max,
  updated_at = now();
