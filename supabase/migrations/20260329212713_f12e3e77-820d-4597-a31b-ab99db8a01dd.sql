CREATE TABLE public.kpi_chart_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_key  TEXT NOT NULL,
  period_label TEXT NOT NULL,
  kpi_key     TEXT NOT NULL,
  content     TEXT NOT NULL,
  author_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_key, kpi_key)
);

ALTER TABLE public.kpi_chart_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can select kpi_chart_comments"
  ON public.kpi_chart_comments FOR SELECT
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can insert kpi_chart_comments"
  ON public.kpi_chart_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id AND public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update own kpi_chart_comments"
  ON public.kpi_chart_comments FOR UPDATE
  USING (auth.uid() = author_id AND public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete own kpi_chart_comments"
  ON public.kpi_chart_comments FOR DELETE
  USING (auth.uid() = author_id AND public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Members can select own company kpi_chart_comments"
  ON public.kpi_chart_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = kpi_chart_comments.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_kpi_chart_comments_updated_at
  BEFORE UPDATE ON public.kpi_chart_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();