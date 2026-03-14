
-- Migration 3: Helper functions for group access

-- Returns the group_id for a user, or NULL if not in a group
CREATE OR REPLACE FUNCTION public.user_group_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT group_id FROM public.group_memberships
  WHERE user_id = _user_id LIMIT 1
$$;

-- Returns true if the user has the group feature flag enabled
CREATE OR REPLACE FUNCTION public.user_has_group_feature(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_feature_flags
    WHERE user_id = _user_id AND enabled = true
  )
$$;

-- Returns true if an advisor has access to a specific group
CREATE OR REPLACE FUNCTION public.advisor_has_group_access(_advisor_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_advisor_access
    WHERE advisor_user_id = _advisor_id AND group_id = _group_id
  )
$$;
