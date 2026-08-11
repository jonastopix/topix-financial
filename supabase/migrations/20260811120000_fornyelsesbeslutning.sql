-- Fornyelsesbeslutning: rådgiverens eksplicitte beslutning om hvorvidt en
-- virksomhed skal tilbydes forlængelse ved kontraktudløb — som SELVSTÆNDIG
-- TABEL, ikke kolonner på companies.
--
-- HVORFOR EGEN TABEL: RLS i Postgres er rækkeniveau, ikke kolonneniveau.
-- Et medlem læser sin egen companies-række (src/hooks/useAuth.tsx:189) og
-- ville derfor kunne læse rådgiverens beslutning og begrundelse om sig selv.
-- Noten skal kunne skrives ærligt, og derfor må den ikke bo på companies.
--
-- FRAVÆRS-SEMANTIK: ingen række = ingen beslutning truffet, og intet må
-- sendes automatisk uden en eksplicit 'tilbyd'. Den sikre standard er
-- tavshed. Derfor er beslutning NOT NULL — en række UDTRYKKER en beslutning;
-- "ikke besluttet" udtrykkes ved at rækken ikke findes.
--
-- updated_at vedligeholdes af skrivestien (ingen trigger i denne migration).
--
-- Rent additiv: ingen backfill, ingen ændring af companies, ingen DROP af
-- eksisterende objekter. Idempotent via IF NOT EXISTS på tabellen og
-- eksistens-tjek på policyen (CREATE POLICY har ikke IF NOT EXISTS).
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.company_fornyelse'::regclass;
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'company_fornyelse';

CREATE TABLE IF NOT EXISTS public.company_fornyelse (
  company_id    uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  beslutning    text NOT NULL
    CONSTRAINT company_fornyelse_beslutning_check
    CHECK (beslutning = ANY (ARRAY['tilbyd'::text, 'tilbyd_ikke'::text])),
  besluttet_af  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  besluttet_at  timestamptz NOT NULL DEFAULT now(),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_fornyelse ENABLE ROW LEVEL SECURITY;

-- Adgang: kun rådgivere og admins — samme rolletjek-mønster som husets
-- øvrige advisor-policies (public.has_role(auth.uid(), 'advisor'), jf.
-- 20260611101500_advisor_company_acknowledgments.sql; admin arver advisor
-- via has_role). FOR ALL dækker SELECT, INSERT, UPDATE og DELETE.
-- Medlemmer har ingen adgang (ingen policy matcher dem), og der er ingen
-- policy for anon (TO authenticated).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_fornyelse'
      AND policyname = 'Advisors manage company fornyelse'
  ) THEN
    CREATE POLICY "Advisors manage company fornyelse"
      ON public.company_fornyelse
      FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'))
      WITH CHECK (public.has_role(auth.uid(), 'advisor'));
  END IF;
END $$;

COMMENT ON TABLE public.company_fornyelse IS
  'Rådgiverens beslutning om forlængelsestilbud pr. virksomhed. Egen tabel (ikke kolonner på companies) fordi RLS er rækkeniveau: medlemmet læser sin egen companies-række og må ikke kunne læse beslutning eller note om sig selv. Ingen række = ingen beslutning truffet — intet må sendes automatisk uden en eksplicit ''tilbyd''; den sikre standard er tavshed.';
COMMENT ON COLUMN public.company_fornyelse.company_id IS
  'Virksomheden beslutningen gælder (PK — højst én beslutning pr. virksomhed).';
COMMENT ON COLUMN public.company_fornyelse.beslutning IS
  'Beslutningen: ''tilbyd'' eller ''tilbyd_ikke''. NOT NULL — fravær af beslutning udtrykkes ved at rækken ikke findes.';
COMMENT ON COLUMN public.company_fornyelse.besluttet_af IS
  'Den rådgiver (auth.users.id) der traf beslutningen. NULL hvis brugeren siden er slettet (ON DELETE SET NULL).';
COMMENT ON COLUMN public.company_fornyelse.besluttet_at IS
  'Tidspunkt for beslutningen.';
COMMENT ON COLUMN public.company_fornyelse.note IS
  'Rådgiverens egen begrundelse. Må kunne skrives ærligt — derfor bor den i denne rådgiver-gatede tabel og ikke på companies.';
COMMENT ON COLUMN public.company_fornyelse.created_at IS
  'Hvornår rækken blev oprettet.';
COMMENT ON COLUMN public.company_fornyelse.updated_at IS
  'Hvornår rækken sidst blev ændret. Vedligeholdes af skrivestien — ingen trigger i denne migration.';
