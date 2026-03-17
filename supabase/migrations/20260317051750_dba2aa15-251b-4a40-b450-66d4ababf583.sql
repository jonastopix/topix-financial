
-- Phase G1: Koncern Activation UX

-- 1. Add welcome_dismissed_at to group_memberships
ALTER TABLE public.group_memberships
ADD COLUMN welcome_dismissed_at timestamptz DEFAULT NULL;

-- 2. RLS: Members can update own welcome_dismissed_at only
CREATE POLICY "Members can dismiss welcome"
ON public.group_memberships FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 3. Trigger: protect group_memberships structural fields from member mutation
CREATE OR REPLACE FUNCTION public.protect_group_membership_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Structural fields are always immutable
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'id is immutable'; END IF;
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN RAISE EXCEPTION 'group_id is immutable'; END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'created_at is immutable'; END IF;

  -- Non-admin users can only update welcome_dismissed_at
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'user_id cannot be changed by non-admin'; END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'role cannot be changed by non-admin'; END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_group_membership_fields
BEFORE UPDATE ON public.group_memberships
FOR EACH ROW EXECUTE FUNCTION protect_group_membership_fields();

-- 4. Admin RLS policies for group visibility
CREATE POLICY "Admins can view all groups"
ON public.groups FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all group companies"
ON public.group_companies FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all group memberships"
ON public.group_memberships FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all group advisor access"
ON public.group_advisor_access FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. admin_create_group DB function (SECURITY DEFINER)
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
BEGIN
  -- 1. Caller must be admin
  IF NOT has_role(_caller_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can create groups';
  END IF;

  -- 2. Build full company list (anchor + others)
  _all_company_ids := array_prepend(_anchor_company_id, _company_ids);
  -- Remove duplicates
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

  FOR _entry IN SELECT * FROM jsonb_array_elements(_member_entries)
  LOOP
    _entry_user_id := (_entry->>'user_id')::uuid;
    _entry_role := COALESCE(_entry->>'role', 'member');

    -- Must have a role
    IF _entry_role NOT IN ('owner', 'member') THEN
      RAISE EXCEPTION 'Invalid role: %. Must be owner or member', _entry_role;
    END IF;

    -- Count owners
    IF _entry_role = 'owner' THEN
      _owner_count := _owner_count + 1;
    END IF;

    -- Validate user belongs to one of the selected companies
    SELECT cm.company_id INTO _user_company
    FROM company_members cm
    WHERE cm.user_id = _entry_user_id
    AND cm.company_id = ANY(_all_company_ids)
    LIMIT 1;

    IF _user_company IS NULL THEN
      RAISE EXCEPTION 'User % does not belong to any of the selected companies', _entry_user_id;
    END IF;

    -- Validate user is not already in a group
    IF user_group_id(_entry_user_id) IS NOT NULL THEN
      RAISE EXCEPTION 'User % already belongs to a group', _entry_user_id;
    END IF;
  END LOOP;

  -- 6. Must have at least one owner
  IF _owner_count = 0 THEN
    RAISE EXCEPTION 'At least one owner is required in member_entries';
  END IF;

  -- 7. Find primary owner (first owner entry) for groups.owner_user_id
  SELECT (_entry->>'user_id')::uuid INTO _entry_user_id
  FROM jsonb_array_elements(_member_entries) AS _entry
  WHERE _entry->>'role' = 'owner'
  LIMIT 1;

  -- 8. Create group with owner_user_id = primary owner (NOT the admin caller)
  INSERT INTO groups (name, owner_user_id, anchor_company_id)
  VALUES (_group_name, _entry_user_id, _anchor_company_id)
  RETURNING id INTO _group_id;

  -- 9. Insert group_companies
  INSERT INTO group_companies (group_id, company_id, sort_order)
  SELECT _group_id, cid, row_number() OVER () - 1
  FROM unnest(_all_company_ids) AS cid;

  -- 10. Insert group_memberships
  FOR _entry IN SELECT * FROM jsonb_array_elements(_member_entries)
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
$$;
