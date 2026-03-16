
-- Phase E Runtime QA Fixture
-- Dedicated group, companies, template markers, budget rows

-- 1. Create 5 QA companies
INSERT INTO companies (id, name) VALUES
  ('eeeee001-0000-0000-0000-c00000000001', 'QA-E Service A'),
  ('eeeee001-0000-0000-0000-c00000000002', 'QA-E Webshop B'),
  ('eeeee001-0000-0000-0000-c00000000003', 'QA-E Ambiguous C'),
  ('eeeee001-0000-0000-0000-c00000000004', 'QA-E NoBudget D'),
  ('eeeee001-0000-0000-0000-c00000000005', 'QA-E NoTemplate E');

-- 2. Create dedicated Phase E QA group
INSERT INTO groups (id, name, owner_user_id, anchor_company_id) VALUES
  ('eeeee001-0000-0000-0000-000000000001', 'Phase E QA Group', '7f1a05ce-53e7-4922-b983-636b2db50b83', 'eeeee001-0000-0000-0000-c00000000001');

-- 3. Move QA member from Phase D group to Phase E group
DELETE FROM group_memberships WHERE user_id = '7f1a05ce-53e7-4922-b983-636b2db50b83';
INSERT INTO group_memberships (group_id, user_id, role) VALUES
  ('eeeee001-0000-0000-0000-000000000001', '7f1a05ce-53e7-4922-b983-636b2db50b83', 'owner');

-- 4. Ensure feature flag exists
INSERT INTO group_feature_flags (user_id, enabled) VALUES
  ('7f1a05ce-53e7-4922-b983-636b2db50b83', true)
ON CONFLICT DO NOTHING;

-- 5. Add all 5 companies to Phase E group
INSERT INTO group_companies (group_id, company_id, sort_order) VALUES
  ('eeeee001-0000-0000-0000-000000000001', 'eeeee001-0000-0000-0000-c00000000001', 1),
  ('eeeee001-0000-0000-0000-000000000001', 'eeeee001-0000-0000-0000-c00000000002', 2),
  ('eeeee001-0000-0000-0000-000000000001', 'eeeee001-0000-0000-0000-c00000000003', 3),
  ('eeeee001-0000-0000-0000-000000000001', 'eeeee001-0000-0000-0000-c00000000004', 4),
  ('eeeee001-0000-0000-0000-000000000001', 'eeeee001-0000-0000-0000-c00000000005', 5);

-- 6. Grant advisor access to Phase E group
INSERT INTO group_advisor_access (group_id, advisor_user_id)
SELECT 'eeeee001-0000-0000-0000-000000000001', ur.user_id
FROM user_roles ur WHERE ur.role IN ('advisor', 'admin')
ON CONFLICT DO NOTHING;

-- 7. Template markers
INSERT INTO budget_targets (company_id, user_id, category, period, budget_amount) VALUES
  ('eeeee001-0000-0000-0000-c00000000001', '7f1a05ce-53e7-4922-b983-636b2db50b83', '__template__', 'service_b2b', 0),
  ('eeeee001-0000-0000-0000-c00000000002', '7f1a05ce-53e7-4922-b983-636b2db50b83', '__template__', 'webshop_b2c', 0),
  ('eeeee001-0000-0000-0000-c00000000003', '7f1a05ce-53e7-4922-b983-636b2db50b83', '__template__', 'service_b2b', 0),
  ('eeeee001-0000-0000-0000-c00000000003', '7f1a05ce-53e7-4922-b983-636b2db50b83', '__template__', 'webshop_b2c', 0),
  ('eeeee001-0000-0000-0000-c00000000004', '7f1a05ce-53e7-4922-b983-636b2db50b83', '__template__', 'service_b2b', 0);

-- 8. Budget rows for Service A (service_b2b) — 11 cats × 12 months
INSERT INTO budget_targets (company_id, user_id, category, period, budget_amount)
SELECT 'eeeee001-0000-0000-0000-c00000000001', '7f1a05ce-53e7-4922-b983-636b2db50b83', cat.key, '2026-base-' || m.month_num, cat.amount
FROM (VALUES ('omsaetning', 100000), ('loenninger', 40000), ('uddannelse', 5000), ('salg_netvaerk', 8000), ('digital_marketing', 12000), ('rejser_transport', 6000), ('lokaler', 15000), ('forsikring', 3000), ('admin_regnskab', 7000), ('tech_software', 10000), ('telefon_internet', 2000)) AS cat(key, amount)
CROSS JOIN generate_series(1, 12) AS m(month_num);

-- 9. Budget rows for Webshop B (webshop_b2c) — 12 cats × 12 months
INSERT INTO budget_targets (company_id, user_id, category, period, budget_amount)
SELECT 'eeeee001-0000-0000-0000-c00000000002', '7f1a05ce-53e7-4922-b983-636b2db50b83', cat.key, '2026-base-' || m.month_num, cat.amount
FROM (VALUES ('omsaetning', 200000), ('vareforbrug', 80000), ('fragt_levering', 15000), ('betalingsgebyrer', 6000), ('loenninger', 50000), ('digital_marketing', 25000), ('seo_content', 8000), ('email_marketing', 4000), ('platform_tech', 12000), ('lager_logistik', 18000), ('forsikring_abonnementer', 5000), ('admin_regnskab', 10000)) AS cat(key, amount)
CROSS JOIN generate_series(1, 12) AS m(month_num);
