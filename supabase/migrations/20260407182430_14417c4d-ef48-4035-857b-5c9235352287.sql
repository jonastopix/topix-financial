-- Remove conflicting old RLS policies on budget_targets

DROP POLICY IF EXISTS "Users can view own budget targets" ON public.budget_targets;

DROP POLICY IF EXISTS "Users can insert own budget targets" ON public.budget_targets;

DROP POLICY IF EXISTS "Users can update own budget targets" ON public.budget_targets;

DROP POLICY IF EXISTS "Users can delete own budget targets" ON public.budget_targets;

-- Keep only company-based policies which are correct

-- Ensure advisors can also manage budgets for companies they advise

DROP POLICY IF EXISTS "Company members can insert company budgets" ON public.budget_targets;

DROP POLICY IF EXISTS "Company members can update company budgets" ON public.budget_targets;

DROP POLICY IF EXISTS "Company members can delete company budgets" ON public.budget_targets;

DROP POLICY IF EXISTS "Company members can view company budgets" ON public.budget_targets;

-- Recreate clean unified policies

CREATE POLICY "Users can view company budgets"
  ON public.budget_targets FOR SELECT
  TO authenticated
  USING (
    company_id = public.user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'advisor')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can insert company budgets"
  ON public.budget_targets FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'advisor')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can update company budgets"
  ON public.budget_targets FOR UPDATE
  TO authenticated
  USING (
    company_id = public.user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'advisor')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can delete company budgets"
  ON public.budget_targets FOR DELETE
  TO authenticated
  USING (
    company_id = public.user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'advisor')
    OR public.has_role(auth.uid(), 'admin')
  );