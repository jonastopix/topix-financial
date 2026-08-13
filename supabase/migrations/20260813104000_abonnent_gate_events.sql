-- Abonnent-gate paa events: medlemskabsdommen AND'es paa — ingen hvidliste.
--
-- Fortsaettelse af 20260813100000. Samme produktbeslutning: en abonnent
-- (exit-produktet) beholder Dine tal og Podcast & Talks og mister alt
-- andet. Events er blandt det, der mistes — HELT, saa her er ingen
-- hvidliste.
-- Maalt i produktion 13-08-2026: events-policyen var alene
-- (status = ANY (ARRAY['published','cancelled','completed'])), og
-- tilmeldingen alene (auth.uid() = user_id). Enhver authenticated bruger
-- kunne se alle ikke-kladde events og tilmelde sig dem.
-- Raadgiverdoeren paa event_registrations blev bygget FOERST, i
-- 20260813093000 (PR #349), netop for at denne migration ikke laaser
-- raadgivere ude af deres egne tilmeldinger. events har i forvejen
-- "Advisors can view all events".
-- "Users can view own registrations" roeres bevidst IKKE: en abonnent maa
-- gerne se sin egen historik af tidligere tilmeldinger. Selve eventet er
-- usynligt; raekken er deres egen.
-- Bevis for forrige trin (20260813100000), maalt med paataget
-- authenticated-rolle 13-08-2026: fuldt medlem 83 items / 13 collections,
-- udloebet bruger 0 / 0, raadgiver 84 / 13.
--
-- Deploy: koeres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter koersel med:
--   SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('events', 'event_registrations')
--   ORDER BY tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- Events- og tilmeldings-policies genskabes med medlemskabsdommen
-- ─────────────────────────────────────────────────────────────────────────
--
-- DROP POLICY-begrundelse (jf. CLAUDE.md-kravet): CREATE POLICY har ikke
-- OR REPLACE, saa hver medlems-policy droppes og genskabes med NOEJAGTIG
-- samme navn og med public.har_aktivt_medlemskab(auth.uid()) AND'et paa.
-- har_aktivt_abonnement bruges bevidst IKKE her — abonnenten skal ikke
-- have events overhovedet. Advisor-policies ("Advisors can view all
-- events", "Advisors can view all registrations", "Advisors can register
-- themselves", "Advisors can update own registrations") og service-role-
-- policies roeres IKKE — Postgres OR'er policies, saa raadgiverne kommer
-- fortsat ind ad deres egen doer.

DROP POLICY "Members can view non-draft events" ON public.events;
CREATE POLICY "Members can view non-draft events"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    status = ANY (ARRAY['published'::text, 'cancelled'::text, 'completed'::text])
    AND public.har_aktivt_medlemskab(auth.uid())
  );

DROP POLICY "Users can register themselves" ON public.event_registrations;
CREATE POLICY "Users can register themselves"
  ON public.event_registrations FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.har_aktivt_medlemskab(auth.uid())
  );

DROP POLICY "Users can update own registrations" ON public.event_registrations;
CREATE POLICY "Users can update own registrations"
  ON public.event_registrations FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.har_aktivt_medlemskab(auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND public.har_aktivt_medlemskab(auth.uid())
  );
