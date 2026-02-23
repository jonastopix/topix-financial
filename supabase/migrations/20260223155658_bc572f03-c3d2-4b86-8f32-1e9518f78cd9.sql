
-- Create report comments table
CREATE TABLE public.report_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.financial_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

-- Advisors can CRUD comments
CREATE POLICY "Advisors can view all comments" ON public.report_comments FOR SELECT USING (public.has_role(auth.uid(), 'advisor'));
CREATE POLICY "Advisors can insert comments" ON public.report_comments FOR INSERT WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'advisor'));
CREATE POLICY "Advisors can update own comments" ON public.report_comments FOR UPDATE USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'advisor'));
CREATE POLICY "Advisors can delete own comments" ON public.report_comments FOR DELETE USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'advisor'));

-- Members can view comments on their own reports
CREATE POLICY "Members can view comments on own reports" ON public.report_comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.financial_reports fr
    WHERE fr.id = report_comments.report_id AND fr.user_id = auth.uid()
  )
);

-- Timestamp trigger
CREATE TRIGGER update_report_comments_updated_at
  BEFORE UPDATE ON public.report_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
