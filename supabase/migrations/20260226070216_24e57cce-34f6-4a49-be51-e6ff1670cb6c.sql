
-- 1. Create advisor_notifications table
CREATE TABLE public.advisor_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL, -- 'report_uploaded' | 'handout_completed'
  title TEXT NOT NULL,
  body TEXT,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  member_id UUID NOT NULL, -- who triggered it
  reference_id UUID, -- report or handout id
  reference_type TEXT, -- 'report' | 'handout'
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.advisor_notifications ENABLE ROW LEVEL SECURITY;

-- 3. Advisors can read all notifications
CREATE POLICY "Advisors can view all notifications"
  ON public.advisor_notifications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

-- 4. Advisors can update (mark as read)
CREATE POLICY "Advisors can update notifications"
  ON public.advisor_notifications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

-- 5. Authenticated users can insert notifications (members create them on actions)
CREATE POLICY "Authenticated users can insert notifications"
  ON public.advisor_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 6. Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.advisor_notifications;

-- 7. Storage RLS policies for financial-documents bucket
-- Members can upload to their company prefix
CREATE POLICY "Members can upload to own company"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'financial-documents' AND
    (storage.foldername(name))[1] = public.user_company_id(auth.uid())::text
  );

-- Members can view files from their own company
CREATE POLICY "Members can view own company files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'financial-documents' AND
    (storage.foldername(name))[1] = public.user_company_id(auth.uid())::text
  );

-- Advisors can view all files
CREATE POLICY "Advisors can view all files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'financial-documents' AND
    public.has_role(auth.uid(), 'advisor')
  );
