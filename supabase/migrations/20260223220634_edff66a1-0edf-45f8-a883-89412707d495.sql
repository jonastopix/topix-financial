
-- Create table for user-customizable industry benchmarks
CREATE TABLE public.kpi_benchmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kpi_key TEXT NOT NULL,
  benchmark_value NUMERIC NOT NULL,
  benchmark_label TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT 'Branchestandard',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, kpi_key)
);

ALTER TABLE public.kpi_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own benchmarks" ON public.kpi_benchmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own benchmarks" ON public.kpi_benchmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own benchmarks" ON public.kpi_benchmarks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own benchmarks" ON public.kpi_benchmarks FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Advisors can view all benchmarks" ON public.kpi_benchmarks FOR SELECT USING (has_role(auth.uid(), 'advisor'::app_role));

CREATE TRIGGER update_kpi_benchmarks_updated_at
  BEFORE UPDATE ON public.kpi_benchmarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
