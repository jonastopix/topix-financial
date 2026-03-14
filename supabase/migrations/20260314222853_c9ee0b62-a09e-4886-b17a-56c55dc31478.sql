
-- Migration 2: Immutability trigger for anchor_company_id
CREATE OR REPLACE FUNCTION public.protect_group_anchor_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.anchor_company_id IS DISTINCT FROM OLD.anchor_company_id THEN
    RAISE EXCEPTION 'anchor_company_id cannot be changed after group creation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_group_anchor_company
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_group_anchor_company();
