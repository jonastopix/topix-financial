-- Pulse/Refleksion: broad advisor read across all companies.
--
-- ALREADY APPLIED MANUALLY in Lovable -> SQL editor (Lovable Cloud owns the
-- Supabase project; migrations are not pushed via CLI). This file is the
-- canonical history record only; do NOT expect to run it against prod, and the
-- idempotent DROP/CREATE below makes a re-run safe if anyone does.
--
-- Before: pulse_checkins had only two SELECT paths: the member policy
-- ("Members manage company checkins", company_id = user_company_id(auth.uid()))
-- and a group-scoped advisor policy ("Advisors read checkins for their
-- companies", via group_companies JOIN group_advisor_access). For a STANDALONE
-- company (no group row) neither path is true for an advisor, so advisors got 0
-- rows and the reflection rendered "Ingen refleksion endnu" on MemberDetail even
-- when the member had filled it in.
--
-- After: a broad advisor SELECT policy, has_role(auth.uid(), 'advisor'), lets
-- advisors read every company's reflections, exactly the same canonical pattern
-- already used for handouts, milestones and conversations. Admin inherits
-- advisor via has_role, so it is covered too.
--
-- SELECT only: this adds NO write access. Members remain the only writers via
-- "Members manage company checkins". The existing member and group-scoped
-- policies are left untouched; this policy OR-stacks on top for advisors.
--
-- Uses the existing SECURITY DEFINER helper public.has_role(uid, role); it is
-- referenced, not modified.

DROP POLICY IF EXISTS "Advisors can view all checkins" ON public.pulse_checkins;

CREATE POLICY "Advisors can view all checkins"
  ON public.pulse_checkins
  FOR SELECT
  USING (public.has_role(auth.uid(), 'advisor'));
