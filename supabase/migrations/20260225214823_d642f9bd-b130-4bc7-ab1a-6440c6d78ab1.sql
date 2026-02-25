CREATE POLICY "Users can update own lever milestones"
ON public.handout_lever_milestones
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM handouts
    WHERE handouts.id = handout_lever_milestones.handout_id
    AND handouts.user_id = auth.uid()
  )
);