ALTER TABLE public.advisor_notifications 
ADD COLUMN IF NOT EXISTS advisor_id UUID REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Advisors can view their notifications" ON public.advisor_notifications;
DROP POLICY IF EXISTS "Advisors can view all notifications" ON public.advisor_notifications;

CREATE POLICY "Advisors can view their notifications"
  ON public.advisor_notifications FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'advisor') AND 
    (advisor_id = auth.uid() OR advisor_id IS NULL)
  );