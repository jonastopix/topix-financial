-- Helper function to check if a company is a group sub-company (not the anchor)
CREATE OR REPLACE FUNCTION public.is_group_subcompany(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM group_companies gc
    JOIN groups g ON g.id = gc.group_id
    WHERE gc.company_id = p_company_id
      AND g.anchor_company_id != p_company_id
  );
$$;