CREATE POLICY "Advisors can delete invitations"
ON public.company_invitations
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'advisor'::app_role));