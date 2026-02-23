
CREATE TABLE public.budget_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  budget_amount NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'Oktober 2025',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, category, period)
);

ALTER TABLE public.budget_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own budget targets"
  ON public.budget_targets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own budget targets"
  ON public.budget_targets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budget targets"
  ON public.budget_targets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budget targets"
  ON public.budget_targets FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_budget_targets_updated_at
  BEFORE UPDATE ON public.budget_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
