
CREATE OR REPLACE FUNCTION public.cleanup_stale_processing_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE financial_reports
  SET status = 'error',
      processed_at = now()
  WHERE status = 'processing'
    AND uploaded_at < now() - interval '10 minutes'
    AND deleted_at IS NULL;
  
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
