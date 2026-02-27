CREATE POLICY "Advisors can insert invitations"
ON public.company_invitations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'advisor'::app_role));