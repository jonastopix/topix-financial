
-- 1. Helper function: is_group_owner
CREATE OR REPLACE FUNCTION public.is_group_owner(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = _group_id AND owner_user_id = _user_id
  )
$$;

-- 2. RPC: owner_add_company_to_group
CREATE OR REPLACE FUNCTION public.owner_add_company_to_group(
  _group_id uuid,
  _company_name text,
  _cvr_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid;
  _trimmed_name text;
  _normalized_cvr text;
  _company_id uuid;
  _next_sort int;
BEGIN
  -- 1. Caller identity
  _caller := auth.uid();
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Ikke autentificeret';
  END IF;

  -- 2. Owner gate (sole truth: groups.owner_user_id)
  IF NOT is_group_owner(_caller, _group_id) THEN
    RAISE EXCEPTION 'Kun ejeren af koncernen kan oprette nye selskaber';
  END IF;

  -- 3. Validate company name
  _trimmed_name := trim(_company_name);
  IF _trimmed_name IS NULL OR _trimmed_name = '' THEN
    RAISE EXCEPTION 'Virksomhedsnavn må ikke være tomt';
  END IF;

  -- 4. CVR handling: normalize to digits-only, validate length, advisory lock, duplicate check
  IF _cvr_number IS NOT NULL AND trim(_cvr_number) != '' THEN
    _normalized_cvr := regexp_replace(trim(_cvr_number), '[^0-9]', '', 'g');

    IF length(_normalized_cvr) != 8 THEN
      RAISE EXCEPTION 'CVR skal være præcis 8 cifre';
    END IF;

    -- Race-safe lock on normalized CVR
    PERFORM pg_advisory_xact_lock(hashtext('cvr:' || _normalized_cvr));

    IF EXISTS (SELECT 1 FROM public.companies WHERE cvr_number = _normalized_cvr) THEN
      RAISE EXCEPTION 'Et selskab med CVR % findes allerede', _normalized_cvr;
    END IF;
  ELSE
    _normalized_cvr := NULL;
  END IF;

  -- 5. Create company
  INSERT INTO public.companies (name, cvr_number)
  VALUES (_trimmed_name, _normalized_cvr)
  RETURNING id INTO _company_id;

  -- 6. Race-safe sort_order calculation
  PERFORM pg_advisory_xact_lock(hashtext('group_sort:' || _group_id::text));

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO _next_sort
  FROM public.group_companies
  WHERE group_id = _group_id;

  -- 7. Link company to group
  INSERT INTO public.group_companies (group_id, company_id, sort_order)
  VALUES (_group_id, _company_id, _next_sort);

  -- 8. Return success
  RETURN jsonb_build_object(
    'success', true,
    'company_id', _company_id,
    'company_name', _trimmed_name
  );
END;
$$;

-- Grant to authenticated only
REVOKE ALL ON FUNCTION public.owner_add_company_to_group(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_add_company_to_group(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_add_company_to_group(uuid, text, text) TO authenticated;
