
CREATE OR REPLACE FUNCTION public.admin_add_company_to_group(
  _caller_id uuid,
  _group_id uuid,
  _company_id uuid,
  _member_entries jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _entry jsonb;
  _entry_user_id uuid;
  _entry_role text;
  _next_sort_order int;
  _existing_group uuid;
  _anchor uuid;
  _added_members int := 0;
  _skipped_members int := 0;
BEGIN
  -- 1. Caller must be admin
  IF NOT has_role(_caller_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can add companies to groups';
  END IF;

  -- 2. Group must exist
  SELECT anchor_company_id INTO _anchor
  FROM groups WHERE id = _group_id;
  IF _anchor IS NULL THEN
    RAISE EXCEPTION 'Group not found: %', _group_id;
  END IF;

  -- 3. Company must not be the anchor
  IF _company_id = _anchor THEN
    RAISE EXCEPTION 'Company is already the anchor of this group';
  END IF;

  -- 4. Company must not already be in ANY group
  SELECT gc.group_id INTO _existing_group
  FROM group_companies gc WHERE gc.company_id = _company_id LIMIT 1;
  IF _existing_group IS NOT NULL THEN
    RAISE EXCEPTION 'Company already belongs to a group (group_id=%)', _existing_group;
  END IF;

  -- 5. Compute next sort_order deterministically
  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO _next_sort_order
  FROM group_companies WHERE group_id = _group_id;

  -- 6. Insert group_companies (unique constraint prevents duplicate retries)
  INSERT INTO group_companies (group_id, company_id, sort_order)
  VALUES (_group_id, _company_id, _next_sort_order);

  -- 7. Process member entries (optional)
  IF _member_entries IS NOT NULL AND jsonb_array_length(_member_entries) > 0 THEN
    FOR _entry IN SELECT value FROM jsonb_array_elements(_member_entries) AS value
    LOOP
      _entry_user_id := (_entry->>'user_id')::uuid;
      _entry_role := COALESCE(_entry->>'role', 'member');

      IF _entry_role NOT IN ('owner', 'member') THEN
        RAISE EXCEPTION 'Invalid role: %. Must be owner or member', _entry_role;
      END IF;

      -- User must belong to the target company
      IF NOT EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.user_id = _entry_user_id AND cm.company_id = _company_id
      ) THEN
        RAISE EXCEPTION 'User % does not belong to company %', _entry_user_id, _company_id;
      END IF;

      -- Check existing group membership
      DECLARE
        _user_existing_group uuid;
      BEGIN
        _user_existing_group := user_group_id(_entry_user_id);
        
        IF _user_existing_group = _group_id THEN
          -- Already in same group → skip silently
          _skipped_members := _skipped_members + 1;
          CONTINUE;
        END IF;

        IF _user_existing_group IS NOT NULL THEN
          -- In a different group → reject
          RAISE EXCEPTION 'User % already belongs to a different group (group_id=%)', _entry_user_id, _user_existing_group;
        END IF;
      END;

      -- Insert membership (ON CONFLICT for extra safety)
      INSERT INTO group_memberships (group_id, user_id, role)
      VALUES (_group_id, _entry_user_id, _entry_role)
      ON CONFLICT DO NOTHING;

      _added_members := _added_members + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', _group_id,
    'company_id', _company_id,
    'sort_order', _next_sort_order,
    'members_added', _added_members,
    'members_skipped', _skipped_members
  );
END;
$$;
