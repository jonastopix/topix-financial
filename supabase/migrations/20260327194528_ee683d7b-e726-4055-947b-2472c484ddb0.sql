DO $$ BEGIN
  CREATE POLICY "Advisors can delete facts" ON public.financial_report_facts
    FOR DELETE TO authenticated USING (has_role(auth.uid(), 'advisor'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Advisors can delete commentaries" ON public.financial_commentaries
    FOR DELETE TO authenticated USING (has_role(auth.uid(), 'advisor'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Advisors can delete notifications" ON public.advisor_notifications
    FOR DELETE TO authenticated USING (has_role(auth.uid(), 'advisor'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;