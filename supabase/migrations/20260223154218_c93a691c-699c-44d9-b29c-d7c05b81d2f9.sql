
-- Allow advisors to view all financial reports
CREATE POLICY "Advisors can view all financial reports"
ON public.financial_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'advisor'));

-- Allow advisors to view all budget targets
CREATE POLICY "Advisors can view all budget targets"
ON public.budget_targets
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'advisor'));

-- Allow advisors to view all user roles (needed for member overview)
CREATE POLICY "Advisors can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'advisor'));
