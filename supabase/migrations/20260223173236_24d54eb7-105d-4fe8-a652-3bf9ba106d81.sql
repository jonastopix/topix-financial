
-- Table for user-defined KPI targets
CREATE TABLE public.kpi_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kpi_key TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  target_label TEXT NOT NULL DEFAULT '',
  lower_is_better BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, kpi_key)
);

ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own kpi targets" ON public.kpi_targets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own kpi targets" ON public.kpi_targets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own kpi targets" ON public.kpi_targets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own kpi targets" ON public.kpi_targets FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Advisors can view all kpi targets" ON public.kpi_targets FOR SELECT USING (has_role(auth.uid(), 'advisor'::app_role));

CREATE TRIGGER update_kpi_targets_updated_at BEFORE UPDATE ON public.kpi_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
