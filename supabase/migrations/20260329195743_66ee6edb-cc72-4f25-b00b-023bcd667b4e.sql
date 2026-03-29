-- Allow advisors to insert company actions for any company
CREATE POLICY "Advisors can insert all company actions"
ON public.company_actions
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'advisor'::app_role));