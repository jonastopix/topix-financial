-- Rådgivernes to-do-liste (Jonas 8/9-2026, ~/Downloads/analyse-todo-listen.md):
-- en LISTE VED SIDEN AF forsiden, ikke et lag på den. «Et sted at få
-- skrevet ned hvad vi snakker om i chatten.» Rådgiveren skriver selv; intet
-- lander automatisk — forsidens opgaver er et andet spor (forsidensDom).
--
-- Beslutningerne:
--   - Frit skrevet: tekst, valgfri virksomhed (et punkt kan handle om BR
--     Roset — eller om ingenting), valgfri frist.
--   - Én liste med ejerskab pr. punkt (ejer_id kan skifte: Jonas skriver
--     noget til Morten). Alle rådgivere ser alle punkter.
--   - Fristen SORTERER (src/lib/raadgiverOpgaver.ts); den notificerer ikke.
--   - Sessioner hører ikke til her.
--   - Ingen kirkegård: intet lukkes eller skjules automatisk. Forfaldne
--     står øverst; gjorte forsvinder fra fladen efter 30 dage (rækken
--     bliver — det er en log).
--
-- Det er den FJERDE tabel i rådgiver-huskeseddel-familien (mangellisten
-- 7/9: advisor_financial_actions, advisor_milestone_actions,
-- advisor_company_acknowledgments). Forskellen: den har en flade fra dag
-- ét (/opgaver), en dom i lib og én skrivevej (hooks/raadgiverOpgaver.ts).
--
-- IKKE KØRT i prod. Køres i Lovable → SQL editor efter merge.

CREATE TABLE IF NOT EXISTS public.raadgiver_opgaver (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Hvem punktet ligger hos. Kan skifte («giv den til Morten»).
  ejer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Hvem der skrev det. Skifter aldrig.
  oprettet_af UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tekst TEXT NOT NULL CHECK (length(btrim(tekst)) > 0),
  -- Valgfri virksomhed; slettes virksomheden, bliver punktet stående uden.
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  -- Valgfri frist som kalenderdag. Sorterer; notificerer ikke.
  frist DATE,
  status TEXT NOT NULL DEFAULT 'aaben' CHECK (status IN ('aaben', 'gjort')),
  gjort_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'gjort') = (gjort_at IS NOT NULL))
);

COMMENT ON TABLE public.raadgiver_opgaver IS
  'Rådgivernes fælles to-do-liste (8/9-2026). Frit skrevet, ejerskab pr. punkt, frist sorterer. Dom: src/lib/raadgiverOpgaver.ts. Skrivevej: src/hooks/raadgiverOpgaver.ts.';

CREATE INDEX IF NOT EXISTS raadgiver_opgaver_status_frist_idx
  ON public.raadgiver_opgaver (status, frist);

-- updated_at som session_bookings (20260407114258:31-33).
DROP TRIGGER IF EXISTS update_raadgiver_opgaver_updated_at ON public.raadgiver_opgaver;
CREATE TRIGGER update_raadgiver_opgaver_updated_at
  BEFORE UPDATE ON public.raadgiver_opgaver
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.raadgiver_opgaver ENABLE ROW LEVEL SECURITY;

-- RLS — samme mønster som #744's acknowledgments (20260908150000):
--   LÆS   alle rådgivere læser alle punkter (admin arver advisor via has_role).
--   OPRET kun som sig selv (oprettet_af = auth.uid()); ejeren må være en anden
--         rådgiver — det er «skriv noget til Morten».
--   RET/SLET ejeren eller den der skrev det. WITH CHECK kræver kun rollen,
--         så et punkt kan gives videre (ejer_id skifter til en anden).
-- Medlemmer har ingen policy der matcher. Ingen policy droppes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'raadgiver_opgaver' AND policyname = 'Advisors read all raadgiver opgaver') THEN
    CREATE POLICY "Advisors read all raadgiver opgaver"
      ON public.raadgiver_opgaver FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'raadgiver_opgaver' AND policyname = 'Advisors insert own raadgiver opgaver') THEN
    CREATE POLICY "Advisors insert own raadgiver opgaver"
      ON public.raadgiver_opgaver FOR INSERT TO authenticated
      WITH CHECK (oprettet_af = auth.uid() AND public.has_role(auth.uid(), 'advisor'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'raadgiver_opgaver' AND policyname = 'Advisors update own or assigned raadgiver opgaver') THEN
    CREATE POLICY "Advisors update own or assigned raadgiver opgaver"
      ON public.raadgiver_opgaver FOR UPDATE TO authenticated
      USING ((ejer_id = auth.uid() OR oprettet_af = auth.uid()) AND public.has_role(auth.uid(), 'advisor'))
      WITH CHECK (public.has_role(auth.uid(), 'advisor'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'raadgiver_opgaver' AND policyname = 'Advisors delete own or assigned raadgiver opgaver') THEN
    CREATE POLICY "Advisors delete own or assigned raadgiver opgaver"
      ON public.raadgiver_opgaver FOR DELETE TO authenticated
      USING ((ejer_id = auth.uid() OR oprettet_af = auth.uid()) AND public.has_role(auth.uid(), 'advisor'));
  END IF;
END $$;
