CREATE OR REPLACE FUNCTION public.cleanup_facts_on_report_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    DELETE FROM public.financial_report_facts
    WHERE source_report_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_cleanup_facts_on_soft_delete
  AFTER UPDATE OF deleted_at ON public.financial_reports
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_facts_on_report_delete();