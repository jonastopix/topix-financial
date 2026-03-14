
-- Migration 4: RLS policies for group tables + REVOKE placeholder for create_group

-- ==================== groups ====================
-- Members can view their own group
CREATE POLICY "Members can view own group"
  ON public.groups FOR SELECT TO authenticated
  USING (id = user_group_id(auth.uid()));

-- Advisors can view groups they have access to
CREATE POLICY "Advisors can view accessible groups"
  ON public.groups FOR SELECT TO authenticated
  USING (advisor_has_group_access(auth.uid(), id));

-- No client INSERT/UPDATE/DELETE on groups (all via RPC)

-- ==================== group_memberships ====================
-- Members can view their own membership
CREATE POLICY "Members can view own membership"
  ON public.group_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Advisors can view memberships for groups they access
CREATE POLICY "Advisors can view group memberships"
  ON public.group_memberships FOR SELECT TO authenticated
  USING (advisor_has_group_access(auth.uid(), group_id));

-- No client INSERT/UPDATE/DELETE on group_memberships

-- ==================== group_companies ====================
-- Members can view companies in their group
CREATE POLICY "Members can view own group companies"
  ON public.group_companies FOR SELECT TO authenticated
  USING (group_id = user_group_id(auth.uid()));

-- Advisors can view group companies they access
CREATE POLICY "Advisors can view group companies"
  ON public.group_companies FOR SELECT TO authenticated
  USING (advisor_has_group_access(auth.uid(), group_id));

-- No client INSERT/UPDATE/DELETE on group_companies

-- ==================== group_advisor_access ====================
-- Advisors can view their own access
CREATE POLICY "Advisors can view own group access"
  ON public.group_advisor_access FOR SELECT TO authenticated
  USING (advisor_user_id = auth.uid());

-- No client INSERT/UPDATE/DELETE on group_advisor_access

-- ==================== group_feature_flags ====================
-- Users can view their own feature flag
CREATE POLICY "Users can view own feature flag"
  ON public.group_feature_flags FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Advisors can view all feature flags
CREATE POLICY "Advisors can view all feature flags"
  ON public.group_feature_flags FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- Advisors can manage feature flags
CREATE POLICY "Advisors can insert feature flags"
  ON public.group_feature_flags FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Advisors can update feature flags"
  ON public.group_feature_flags FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Advisors can delete feature flags"
  ON public.group_feature_flags FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));
