
-- Replace the overly permissive INSERT policy with one that requires the member_id to match the inserter
DROP POLICY "Authenticated users can insert notifications" ON public.advisor_notifications;

CREATE POLICY "Members can insert own notifications"
  ON public.advisor_notifications FOR INSERT
  TO authenticated
  WITH CHECK (member_id = auth.uid());
