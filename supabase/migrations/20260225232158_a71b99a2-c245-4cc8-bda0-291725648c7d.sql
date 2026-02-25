
-- Fix unique constraint to include company_id
ALTER TABLE budget_targets DROP CONSTRAINT IF EXISTS budget_targets_user_id_category_period_key;
ALTER TABLE budget_targets ADD CONSTRAINT budget_targets_company_category_period_key UNIQUE (company_id, user_id, category, period);
