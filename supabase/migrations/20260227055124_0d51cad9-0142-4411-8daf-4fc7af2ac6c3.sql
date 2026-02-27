-- Allow advisors to insert financial reports (for bulk import on behalf of members)
CREATE POLICY "Advisors can insert financial reports"
ON public.financial_reports
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'advisor'::app_role));

-- Allow advisors to update financial reports
CREATE POLICY "Advisors can update financial reports"
ON public.financial_reports
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'advisor'::app_role));

-- Allow advisors to delete financial reports
CREATE POLICY "Advisors can delete financial reports"
ON public.financial_reports
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'advisor'::app_role));