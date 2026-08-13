-- Raadgivere kan tilmelde sig events paa egne vegne.
--
-- Baggrund (maalt i produktion 13-08-2026): raadgivere har i dag KUN en
-- SELECT-policy paa event_registrations ("Advisors can view all registrations").
-- De tilmelder sig events gennem MEDLEMMERNES policy "Users can register
-- themselves", som alene kraever (auth.uid() = user_id) uden nogen
-- medlemskabsdom. jonas@topix.dk (admin+advisor) har 0 raekker i
-- company_members, men 2 raekker i event_registrations — tilmeldt netop ad
-- den vej.
--
-- Naar abonnent-graensen senere lukkes, AND'es har_aktivt_medlemskab paa
-- medlems-policyen, og raadgivere ville da miste evnen til at tilmelde sig.
-- Disse to policies er doeren, der skal staa FOER den aendring. De er rent
-- additive: Postgres OR'er policies, saa ingen mister adgang af at der
-- kommer en policy mere.
--
-- Praedikatet er bevidst snaevert: has_role(advisor) AND auth.uid() = user_id.
-- Det bevarer noejagtig den evne raadgivere har i dag og giver dem IKKE ret
-- til at tilmelde andre brugere — en evne ingen har bedt om, og som ikke skal
-- opstaa som sidegevinst i en migration om noget andet.

CREATE POLICY "Advisors can register themselves"
  ON public.event_registrations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'advisor'::app_role)
    AND auth.uid() = user_id
  );

COMMENT ON POLICY "Advisors can register themselves" ON public.event_registrations IS
  'Raadgiverens egen doer til at tilmelde sig et event. Snaevert praedikat: kun sig selv. Skal staa foer har_aktivt_medlemskab AND es paa medlems-policyen.';

CREATE POLICY "Advisors can update own registrations"
  ON public.event_registrations FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'advisor'::app_role)
    AND auth.uid() = user_id
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'advisor'::app_role)
    AND auth.uid() = user_id
  );

COMMENT ON POLICY "Advisors can update own registrations" ON public.event_registrations IS
  'Raadgiverens egen doer til afbud og afmelding (response og cancelled_at). Snaevert praedikat: kun egne raekker.';
