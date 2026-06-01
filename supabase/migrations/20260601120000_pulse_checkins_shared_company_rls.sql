-- Pulse/Refleksion: shared company reflection (Model B).
--
-- Before: RLS policy "Members manage own checkins" scoped rows to the writer
-- (user_id = auth.uid()). Combined with UNIQUE(company_id, period_key), only one
-- member could ever hold the single company row — a second member's upsert
-- collided with the first member's RLS-invisible row and failed.
--
-- After: any member of the company can SELECT + INSERT + UPDATE the company's
-- single reflection row for a period. The UNIQUE(company_id, period_key)
-- constraint is INTENTIONALLY KEPT — there is still exactly one shared reflection
-- per company per month; members collaborate on it, and user_id records who
-- wrote/updated it last.
--
-- DROP POLICY rationale: the old per-user scope is replaced wholesale by the
-- company scope below; keeping both would be contradictory (own-only vs company).
-- The advisor read policy ("Advisors read checkins for their companies") is left
-- untouched.
--
-- Uses the existing SECURITY DEFINER helper public.user_company_id(uid); it is
-- referenced, not modified.

DROP POLICY IF EXISTS "Members manage own checkins" ON public.pulse_checkins;

CREATE POLICY "Members manage company checkins"
  ON public.pulse_checkins
  FOR ALL TO authenticated
  USING (company_id = public.user_company_id(auth.uid()))
  WITH CHECK (company_id = public.user_company_id(auth.uid()));
