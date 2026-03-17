
-- RP-2: financial_commentaries table + hash function + stale trigger

-- 1. Deterministic hash function (shared between generate-path and trigger)
CREATE OR REPLACE FUNCTION public.compute_facts_metrics_hash(_metrics jsonb)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public'
AS $$
  SELECT md5(_metrics::text)
$$;

-- 2. financial_commentaries table
CREATE TABLE public.financial_commentaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  facts_id uuid NOT NULL REFERENCES public.financial_report_facts(id) ON DELETE RESTRICT,
  basis_metrics_hash text NOT NULL,
  basis_committed_at timestamptz NOT NULL,
  basis_source_type text NOT NULL,
  analysis jsonb NOT NULL,
  is_stale boolean NOT NULL DEFAULT false,
  generated_by uuid NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Index for latest lookup per company+period
CREATE INDEX idx_commentaries_company_period
  ON public.financial_commentaries (company_id, period_key, generated_at DESC);

-- 4. Enable RLS
ALTER TABLE public.financial_commentaries ENABLE ROW LEVEL SECURITY;

-- 5. RLS: SELECT only for company members + advisors
CREATE POLICY "Members can read own company commentaries"
  ON public.financial_commentaries FOR SELECT TO authenticated
  USING (
    company_id = user_company_id(auth.uid())
    OR has_role(auth.uid(), 'advisor'::app_role)
  );

-- NO INSERT/UPDATE/DELETE policies — only service-role can write

-- 6. Stale trigger: mark commentaries stale when facts metrics change
CREATE OR REPLACE FUNCTION public.mark_commentaries_stale()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.financial_commentaries
  SET is_stale = true
  WHERE company_id = NEW.company_id
    AND period_key = (
      SELECT period_key FROM public.financial_report_facts WHERE id = NEW.id
    )
    AND basis_metrics_hash != compute_facts_metrics_hash(NEW.metrics)
    AND is_stale = false;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mark_commentaries_stale
  AFTER INSERT OR UPDATE ON public.financial_report_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_commentaries_stale();
