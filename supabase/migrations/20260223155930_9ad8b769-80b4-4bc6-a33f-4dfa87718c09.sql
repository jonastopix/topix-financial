
-- Allow members to insert comments on their own reports
CREATE POLICY "Members can insert comments on own reports" ON public.report_comments
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.financial_reports fr
    WHERE fr.id = report_comments.report_id AND fr.user_id = auth.uid()
  )
);

-- Allow members to delete their own comments
CREATE POLICY "Members can delete own comments" ON public.report_comments
FOR DELETE USING (auth.uid() = user_id);
