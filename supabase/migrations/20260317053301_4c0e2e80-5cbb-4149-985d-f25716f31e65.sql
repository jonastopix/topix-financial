CREATE OR REPLACE FUNCTION public.admin_create_group(
  _caller_id uuid,
  _group_name text,
  _anchor_company_id uuid,
  _company_ids uuid[],
  _member_entries jsonb,
  _advisor_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _group_id uuid;
  _cid uuid;
  _entry jsonb;
  _owner_count int := 0;
  _entry_user_id uuid;
  _entry_role text;
  _all_company_ids uuid[];
  _user_company uuid;
  _primary_owner_id uuid;
BEGIN
  -- 1. Caller must be admin
  IF NOT has_role(_caller_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can create groups';
  END IF;

  -- 2. Build full company list (anchor + others)
  _all_company_ids := array_prepend(_anchor_company_id, _company_ids);
  SELECT array_agg(DISTINCT x) INTO _all_company_ids FROM unnest(_all_company_ids) x;

  -- 3. Validate anchor is in list
  IF NOT (_anchor_company_id = ANY(_all_company_ids)) THEN
    RAISE EXCEPTION 'Anchor company must be included in company list';
  END IF;

  -- 4. Validate no company is already grouped
  IF EXISTS (
    SELECT 1 FROM group_companies gc WHERE gc.company_id = ANY(_all_company_ids)
  ) THEN
    RAISE EXCEPTION 'One or more companies already belong to a group';
  END IF;

  -- 5. Validate member_entries
  IF _member_entries IS NULL OR jsonb_array_length(_member_entries) = 0 THEN
    RAISE EXCEPTION 'At least one member entry is required';
  END IF;

  FOR _entry IN SELECT value FROM jsonb_array_elements(_member_entries) AS value
  LOOP
    _entry_user_id := (_entry->>'user_id')::uuid;
    _entry_role := COALESCE(_entry->>'role', 'member');

    IF _entry_role NOT IN ('owner', 'member') THEN
      RAISE EXCEPTION 'Invalid role: %. Must be owner or member', _entry_role;
    END IF;

    IF _entry_role = 'owner' THEN
      _owner_count := _owner_count + 1;
    END IF;

    SELECT cm.company_id INTO _user_company
    FROM company_members cm
    WHERE cm.user_id = _entry_user_id
    AND cm.company_id = ANY(_all_company_ids)
    LIMIT 1;

    IF _user_company IS NULL THEN
      RAISE EXCEPTION 'User % does not belong to any of the selected companies', _entry_user_id;
    END IF;

    IF user_group_id(_entry_user_id) IS NOT NULL THEN
      RAISE EXCEPTION 'User % already belongs to a group', _entry_user_id;
    END IF;
  END LOOP;

  -- 6. Must have at least one owner
  IF _owner_count = 0 THEN
    RAISE EXCEPTION 'At least one owner is required in member_entries';
  END IF;

  -- 7. Find primary owner for groups.owner_user_id
  SELECT (me->>'user_id')::uuid INTO _primary_owner_id
  FROM jsonb_array_elements(_member_entries) AS me
  WHERE me->>'role' = 'owner'
  LIMIT 1;

  -- 8. Create group with owner_user_id = primary owner (NOT the admin caller)
  INSERT INTO groups (name, owner_user_id, anchor_company_id)
  VALUES (_group_name, _primary_owner_id, _anchor_company_id)
  RETURNING id INTO _group_id;

  -- 9. Insert group_companies
  INSERT INTO group_companies (group_id, company_id, sort_order)
  SELECT _group_id, cid, row_number() OVER () - 1
  FROM unnest(_all_company_ids) AS cid;

  -- 10. Insert group_memberships
  FOR _entry IN SELECT value FROM jsonb_array_elements(_member_entries) AS value
  LOOP
    INSERT INTO group_memberships (group_id, user_id, role)
    VALUES (_group_id, (_entry->>'user_id')::uuid, COALESCE(_entry->>'role', 'member'))
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 11. Insert group_advisor_access
  IF _advisor_ids IS NOT NULL AND array_length(_advisor_ids, 1) > 0 THEN
    INSERT INTO group_advisor_access (group_id, advisor_user_id)
    SELECT _group_id, aid
    FROM unnest(_advisor_ids) AS aid
    ON CONFLICT DO NOTHING;
  END IF;

  -- 12. Return result
  RETURN jsonb_build_object('group_id', _group_id);
END;
$$