
DROP POLICY "Users can insert own feedback" ON public.feedback;
CREATE POLICY "Users can insert own feedback"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      company_id IS NULL
      OR company_id = user_company_id(auth.uid())
    )
  );
