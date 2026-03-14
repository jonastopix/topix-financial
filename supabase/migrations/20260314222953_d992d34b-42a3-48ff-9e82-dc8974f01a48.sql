
-- Migration 5: create_group RPC + REVOKE

CREATE OR REPLACE FUNCTION public.create_group(
  _caller_id uuid, _group_name text, _companies jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _group_id uuid;
  _anchor uuid;
  _comp jsonb;
  _new_company_id uuid;
  _first_create jsonb;
  _first_create_processed boolean := false;
BEGIN
  -- 1. Feature flag check
  IF NOT user_has_group_feature(_caller_id) THEN
    RAISE EXCEPTION 'Group feature not enabled for this user';
  END IF;

  -- 2. No existing group
  IF user_group_id(_caller_id) IS NOT NULL THEN
    RAISE EXCEPTION 'User already belongs to a group';
  END IF;

  -- 3. Resolve anchor
  _anchor := user_company_id(_caller_id);

  IF _anchor IS NULL THEN
    -- Find first mode="create" entry to use as anchor
    SELECT val INTO _first_create
    FROM jsonb_array_elements(_companies) AS val
    WHERE val->>'mode' = 'create'
    LIMIT 1;

    IF _first_create IS NULL THEN
      RAISE EXCEPTION 'No company membership and no new company provided';
    END IF;

    -- Create anchor company + single company_members row
    INSERT INTO companies (name, cvr_number)
    VALUES (_first_create->>'name', _first_create->>'cvr')
    RETURNING id INTO _anchor;

    INSERT INTO company_members (company_id, user_id, role)
    VALUES (_anchor, _caller_id, 'owner');

    _first_create_processed := true;
  END IF;

  -- 4. Validate anchor not already grouped
  IF EXISTS (SELECT 1 FROM group_companies WHERE company_id = _anchor) THEN
    RAISE EXCEPTION 'Anchor company already belongs to a group';
  END IF;

  -- 5. Validate all attach companies
  FOR _comp IN SELECT * FROM jsonb_array_elements(_companies)
  LOOP
    IF _comp->>'mode' = 'attach' THEN
      -- Must be a member of the company
      IF NOT EXISTS (
        SELECT 1 FROM company_members
        WHERE user_id = _caller_id AND company_id = (_comp->>'company_id')::uuid
      ) THEN
        RAISE EXCEPTION 'Cannot attach company: caller is not a member';
      END IF;
      -- Company must not already be in a group
      IF EXISTS (
        SELECT 1 FROM group_companies
        WHERE company_id = (_comp->>'company_id')::uuid
      ) THEN
        RAISE EXCEPTION 'Company already belongs to a group';
      END IF;
    END IF;
  END LOOP;

  -- 6. Create group
  INSERT INTO groups (name, owner_user_id, anchor_company_id)
  VALUES (_group_name, _caller_id, _anchor)
  RETURNING id INTO _group_id;

  -- 7. Create membership
  INSERT INTO group_memberships (group_id, user_id, role)
  VALUES (_group_id, _caller_id, 'owner');

  -- 8. Anchor always in group_companies (hard insert, pre-validated)
  INSERT INTO group_companies (group_id, company_id, sort_order)
  VALUES (_group_id, _anchor, 0);

  -- 9. Process remaining companies (skip anchor via dedup)
  FOR _comp IN SELECT * FROM jsonb_array_elements(_companies)
  LOOP
    IF _comp->>'mode' = 'create' THEN
      -- Skip if this was the first-create anchor already processed
      IF _first_create_processed
         AND _comp->>'name' = _first_create->>'name'
         AND COALESCE(_comp->>'cvr', '') = COALESCE(_first_create->>'cvr', '') THEN
        _first_create_processed := false;
        CONTINUE;
      END IF;

      INSERT INTO companies (name, cvr_number)
      VALUES (_comp->>'name', _comp->>'cvr')
      RETURNING id INTO _new_company_id;

      INSERT INTO group_companies (group_id, company_id)
      VALUES (_group_id, _new_company_id);

    ELSIF _comp->>'mode' = 'attach' THEN
      -- Skip if this is the anchor (dedup)
      IF (_comp->>'company_id')::uuid = _anchor THEN
        CONTINUE;
      END IF;

      INSERT INTO group_companies (group_id, company_id)
      VALUES (_group_id, (_comp->>'company_id')::uuid);
    END IF;
  END LOOP;

  -- 10. Seed advisor access (v1: all advisors get access)
  INSERT INTO group_advisor_access (group_id, advisor_user_id)
  SELECT _group_id, ur.user_id
  FROM user_roles ur
  WHERE ur.role IN ('advisor', 'admin')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('group_id', _group_id);
END;
$$;

-- Lock down: only service-role may execute this function
REVOKE EXECUTE ON FUNCTION public.create_group(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
