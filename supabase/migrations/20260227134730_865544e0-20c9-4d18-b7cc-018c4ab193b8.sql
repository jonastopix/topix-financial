CREATE POLICY "Advisors can update invitations"
  ON public.company_invitations
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));