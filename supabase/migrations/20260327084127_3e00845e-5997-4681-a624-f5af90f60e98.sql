ALTER TABLE public.financial_commentaries
  DROP CONSTRAINT financial_commentaries_facts_id_fkey;

ALTER TABLE public.financial_commentaries
  ADD CONSTRAINT financial_commentaries_facts_id_fkey
  FOREIGN KEY (facts_id)
  REFERENCES public.financial_report_facts(id)
  ON DELETE CASCADE;