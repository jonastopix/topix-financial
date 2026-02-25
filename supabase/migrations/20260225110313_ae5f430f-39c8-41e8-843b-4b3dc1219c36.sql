-- Allow advisors to delete companies
CREATE POLICY "Advisors can delete companies"
ON public.companies FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'advisor'::app_role));

-- Allow advisors to update company_members (for reassigning users)
CREATE POLICY "Advisors can update company members"
ON public.company_members FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'advisor'::app_role));

-- Allow advisors to delete company_members
CREATE POLICY "Advisors can delete company members"
ON public.company_members FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'advisor'::app_role));

-- Allow advisors to insert company_members (for assigning users to companies)
CREATE POLICY "Advisors can insert company members"
ON public.company_members FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'advisor'::app_role));

-- Allow advisors to delete conversations (for cleanup)
CREATE POLICY "Advisors can delete conversations"
ON public.conversations FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'advisor'::app_role));

-- Allow advisors to insert conversations
CREATE POLICY "Advisors can insert conversations"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'advisor'::app_role));

-- Allow advisors to insert companies
CREATE POLICY "Advisors can insert companies"
ON public.companies FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'advisor'::app_role));