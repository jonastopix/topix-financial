CREATE POLICY "Users can update circle_members to link own profile"
  ON public.circle_members FOR UPDATE
  TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);