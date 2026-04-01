
DO $$
DECLARE
  _company_id uuid := 'a0de0000-0000-4000-8000-000000000001';
  _report_id  uuid := 'a0de0000-0000-4000-8000-000000000002';
  _demo_user_id uuid;
  _now_period text;
  _week_key text;
BEGIN
  -- 1. Company
  INSERT INTO public.companies (id, name, cvr_number, industry_code, industry_label, weekly_focus_enabled)
  VALUES (_company_id, 'Nordly ApS', '12345678', 'tech_software', 'Tech & SaaS', true)
  ON CONFLICT (id) DO NOTHING;

  -- 2. Look up demo user
  SELECT id INTO _demo_user_id FROM auth.users WHERE email = 'demo@theboardroom.dk' LIMIT 1;
  IF _demo_user_id IS NULL THEN
    RAISE NOTICE 'Demo user not found — skipping user-dependent seed data. Create the auth user first, then re-run.';
    RETURN;
  END IF;

  -- 3. Company membership
  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (_company_id, _demo_user_id, 'owner')
  ON CONFLICT DO NOTHING;

  -- 4. Profile
  INSERT INTO public.profiles (user_id, full_name, company_name, email, onboarded_at)
  VALUES (_demo_user_id, 'Demo Bruger', 'Nordly ApS', 'demo@theboardroom.dk', now())
  ON CONFLICT DO NOTHING;

  -- 5. Placeholder financial report
  INSERT INTO public.financial_reports (id, company_id, user_id, file_name, file_path, report_type, status, processed_at)
  VALUES (_report_id, _company_id, _demo_user_id, 'demo-seed.csv', 'demo/seed.csv', 'resultatopgoerelse', 'processed', now())
  ON CONFLICT (id) DO NOTHING;

  -- 6. Financial report facts (12 months)
  INSERT INTO public.financial_report_facts (company_id, source_report_id, period_key, period_label, source_type, metrics, committed_by) VALUES
    (_company_id, _report_id, '2025-01', 'Januar 2025', 'canonical', '{"revenue":182000,"gross_profit":167440,"payroll":85000,"sales_costs":29120,"facility_costs":12000,"admin_costs":28000,"ebitda":13320,"cash":85000,"assets_total":420000,"equity_total":185000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-02', 'Februar 2025', 'canonical', '{"revenue":195000,"gross_profit":179400,"payroll":85000,"sales_costs":31200,"facility_costs":12000,"admin_costs":28000,"ebitda":23200,"cash":72000,"assets_total":435000,"equity_total":208000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-03', 'Marts 2025', 'canonical', '{"revenue":210000,"gross_profit":193200,"payroll":92000,"sales_costs":33600,"facility_costs":12000,"admin_costs":31000,"ebitda":24600,"cash":95000,"assets_total":458000,"equity_total":232000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-04', 'April 2025', 'canonical', '{"revenue":198000,"gross_profit":182160,"payroll":92000,"sales_costs":31680,"facility_costs":12000,"admin_costs":29000,"ebitda":17480,"cash":88000,"assets_total":445000,"equity_total":249000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-05', 'Maj 2025', 'canonical', '{"revenue":225000,"gross_profit":207000,"payroll":92000,"sales_costs":36000,"facility_costs":12000,"admin_costs":31000,"ebitda":36000,"cash":120000,"assets_total":490000,"equity_total":285000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-06', 'Juni 2025', 'canonical', '{"revenue":248000,"gross_profit":228160,"payroll":105000,"sales_costs":39680,"facility_costs":12000,"admin_costs":33000,"ebitda":38480,"cash":145000,"assets_total":520000,"equity_total":323000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-07', 'Juli 2025', 'canonical', '{"revenue":232000,"gross_profit":213440,"payroll":105000,"sales_costs":37120,"facility_costs":12000,"admin_costs":30000,"ebitda":29320,"cash":132000,"assets_total":498000,"equity_total":352000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-08', 'August 2025', 'canonical', '{"revenue":267000,"gross_profit":245640,"payroll":115000,"sales_costs":42720,"facility_costs":12000,"admin_costs":32000,"ebitda":43920,"cash":168000,"assets_total":545000,"equity_total":396000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-09', 'September 2025', 'canonical', '{"revenue":285000,"gross_profit":262200,"payroll":115000,"sales_costs":45600,"facility_costs":12000,"admin_costs":34000,"ebitda":55600,"cash":195000,"assets_total":578000,"equity_total":451000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-10', 'Oktober 2025', 'canonical', '{"revenue":310000,"gross_profit":285200,"payroll":130000,"sales_costs":49600,"facility_costs":12000,"admin_costs":35000,"ebitda":58600,"cash":220000,"assets_total":615000,"equity_total":509000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-11', 'November 2025', 'canonical', '{"revenue":298000,"gross_profit":274160,"payroll":130000,"sales_costs":47680,"facility_costs":12000,"admin_costs":36000,"ebitda":48480,"cash":205000,"assets_total":598000,"equity_total":557000}'::jsonb, _demo_user_id),
    (_company_id, _report_id, '2025-12', 'December 2025', 'canonical', '{"revenue":342000,"gross_profit":314640,"payroll":140000,"sales_costs":54720,"facility_costs":12000,"admin_costs":38000,"ebitda":69920,"cash":248000,"assets_total":665000,"equity_total":627000}'::jsonb, _demo_user_id)
  ON CONFLICT DO NOTHING;

  -- 7. Milestones
  INSERT INTO public.milestones (company_id, user_id, title, target_value, current_value, unit, deadline, category, source, status, progress) VALUES
    (_company_id, _demo_user_id, 'Nå 400.000 kr. MRR', 400000, 342000, 'kr.', '2026-03-31', 'finance', 'manual', 'active', 85),
    (_company_id, _demo_user_id, 'Reducér churn til under 1%', 1, 1.2, '%', '2026-06-30', 'operations', 'manual', 'active', 0),
    (_company_id, _demo_user_id, 'Ansæt Customer Success Manager', NULL, NULL, NULL, '2026-04-30', 'team', 'manual', 'active', 30)
  ON CONFLICT DO NOTHING;

  -- 8. KPI targets
  INSERT INTO public.kpi_targets (company_id, user_id, kpi_key, target_value, target_label) VALUES
    (_company_id, _demo_user_id, 'omsaetning', 400000, 'Mål'),
    (_company_id, _demo_user_id, 'db_margin', 90, 'Mål'),
    (_company_id, _demo_user_id, 'loenninger', 150000, 'Mål'),
    (_company_id, _demo_user_id, 'resultat', 50000, 'Mål')
  ON CONFLICT DO NOTHING;

  -- 9. Weekly focus
  _week_key := to_char(date_trunc('week', now()), 'IYYY-"W"IW');
  INSERT INTO public.weekly_focus (company_id, week_key, status, headline, summary, expires_at) VALUES
    (_company_id, _week_key, 'active',
     'Fokus på skalering og churn-reduktion',
     'Nordly ApS har haft en stærk vækst de seneste 12 måneder med omsætningen steget fra 182.000 til 342.000 kr. MRR. De tre vigtigste fokuspunkter denne uge: (1) Følg op på de tre nye enterprise-kunder for at sikre en god onboarding og reducere early churn. (2) Start rekrutteringsprocessen for en Customer Success Manager — I er tæt på at nå størrelsen, hvor det giver mening. (3) Gennemgå jeres salgsomkostninger, som er steget markant — overvej om CAC er bæredygtig ved den nuværende vækstrate.',
     now() + interval '8 days')
  ON CONFLICT (company_id, week_key) DO NOTHING;

  -- 10. Pulse check-in
  _now_period := to_char(now(), 'YYYY-MM');
  INSERT INTO public.pulse_checkins (company_id, user_id, period_key, went_well, biggest_challenge, help_needed) VALUES
    (_company_id, _demo_user_id, _now_period,
     'Vi landede tre nye enterprise-kunder i denne måned og vores churn er nede på 1,2%.',
     'Vi har svært ved at skalere vores support-organisation i takt med væksten.',
     'Har brug for sparring om, hvornår det giver mening at ansætte en Customer Success Manager.')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Demo seed complete for Nordly ApS (company_id: %)', _company_id;
END $$;
