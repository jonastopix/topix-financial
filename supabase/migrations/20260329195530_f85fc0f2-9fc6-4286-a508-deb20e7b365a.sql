-- Allow advisors to update company actions (mark done, park, dismiss)
CREATE POLICY "Advisors can update all company actions"
ON public.company_actions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'advisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'advisor'::app_role));