
-- Create milestones table
CREATE TABLE public.milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  deadline DATE,
  progress INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'manual',
  source_report TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- Members can CRUD own milestones
CREATE POLICY "Users can view own milestones" ON public.milestones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own milestones" ON public.milestones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own milestones" ON public.milestones FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own milestones" ON public.milestones FOR DELETE USING (auth.uid() = user_id);

-- Advisors can view all milestones
CREATE POLICY "Advisors can view all milestones" ON public.milestones FOR SELECT USING (public.has_role(auth.uid(), 'advisor'));

-- Timestamp trigger
CREATE TRIGGER update_milestones_updated_at
  BEFORE UPDATE ON public.milestones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
