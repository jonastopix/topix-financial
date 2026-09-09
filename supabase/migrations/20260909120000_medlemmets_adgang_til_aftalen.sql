-- Medlemmets adgang til sin egen aftale (Jonas 9/9-2026): to SELECT-policyer.
--
-- HVORFOR: rådgiveren har blok 7 «Aftalen» på virksomhedssiden — perioder
-- (company_perioder) og træk (company_traek) — men medlemmet havde intet
-- modstykke. Efter to dages fornyelseskæde (varsler, bånd, betaling,
-- kvittering) kunne et medlem stadig ikke slå op hvad de betaler, efter
-- hvilken model, hvilke perioder de har haft, eller hvornår medlemskabet
-- udløber. Begge tabeller havde KUN «Advisors can view …» og service role
-- (20260901140000:44-55, 20260903150000:104-111) — et medlem fik nul rækker.
--
-- MØNSTRET er husets (CLAUDE.md «Company-scoped», company_actions
-- 20260329190316:69-71): company_id = public.user_company_id(auth.uid()),
-- hvor user_company_id er den eksisterende SECURITY DEFINER-hjælper
-- (20260223…:29-37). Intet nyt opfindes; funktionen røres ikke.
--
-- KUN SELECT. Perioder og træk skrives af stripe-webhook med service role
-- (og perioder af rådgivere); et medlem skal aldrig kunne rette hvad de
-- har betalt. Ingen INSERT/UPDATE/DELETE for medlemmer. Policyerne er
-- PERMISSIVE og lægges VED SIDEN AF rådgiver-policyerne (stakker med OR) —
-- de udvider læseadgang for én rolle, de indskrænker intet.
--
-- company_fornyelse får BEVIDST INGEN medlemspolicy: beslutningen
-- («vi tilbyder» / «vi tilbyder ikke»), noten og varselsstemplerne er
-- VORES noter om dem, ikke deres aftale. Medlemmet ser fornyelsen gennem
-- båndet og mailene, ikke gennem rækken.
--
-- IKKE KØRT i prod. Køres i hånden i Lovable → SQL editor efter merge,
-- med SELECT før og efter (nederst).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_perioder'
      AND policyname = 'Members can view own company perioder'
  ) THEN
    CREATE POLICY "Members can view own company perioder"
      ON public.company_perioder
      FOR SELECT
      TO authenticated
      USING (company_id = public.user_company_id(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_traek'
      AND policyname = 'Members can view own company traek'
  ) THEN
    CREATE POLICY "Members can view own company traek"
      ON public.company_traek
      FOR SELECT
      TO authenticated
      USING (company_id = public.user_company_id(auth.uid()));
  END IF;
END $$;

-- FØR/EFTER (kør i SQL editor):
--   SELECT tablename, policyname, cmd, permissive, roles, qual
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('company_perioder', 'company_traek')
--   ORDER BY tablename, policyname;
-- Før: to (perioder) + to (traek) policyer, ingen «Members …».
-- Efter: én «Members can view own …» mere pr. tabel, cmd = SELECT, permissive.
--
-- BEVIS som medlem (SQL editor kan sætte rollen; vælg et medlem der HAR
-- perioder, fx via SELECT user_id FROM company_members WHERE company_id = …):
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', json_build_object('sub', '<medlemmets user_id>', 'role', 'authenticated')::text, true);
--   SELECT count(*) AS egne, count(*) FILTER (WHERE company_id <> public.user_company_id(auth.uid())) AS andres
--   FROM public.company_perioder;
--   -- forventet: egne = virksomhedens antal perioder, andres = 0. Samme for company_traek.
--   RESET ROLE;
