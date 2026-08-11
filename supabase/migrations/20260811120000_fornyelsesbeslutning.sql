-- Fornyelsesbeslutning: rådgiverens eksplicitte beslutning om hvorvidt en
-- virksomhed skal tilbydes forlængelse ved kontraktudløb.
--
-- Baggrund (recon-udloeb.md, 2026-08-11): der findes i dag INTET felt der
-- udtrykker om en virksomhed skal tilbydes forlængelse — udløbsgaten viser
-- samme hardcodede tilbud til alle udløbne. Disse fire kolonner gør
-- beslutningen eksplicit og sporbar (hvem, hvornår, hvorfor).
--
-- NULL-semantik (bevidst — derfor INGEN DEFAULT): NULL betyder "ingen
-- beslutning truffet", og intet må sendes automatisk på et NULL. Den sikre
-- standard er tavshed. En automatik der læser feltet skal kræve en eksplicit
-- 'tilbyd' før den foretager sig noget.
--
-- Rent additiv: ingen backfill, ingen UPDATE, ingen DROP. Idempotent via
-- IF NOT EXISTS på kolonnerne og eksistens-tjek på constrainten (Postgres
-- har ikke IF NOT EXISTS til ADD CONSTRAINT).
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'companies'
--     AND column_name LIKE 'fornyelse%';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS fornyelse_beslutning text,
  ADD COLUMN IF NOT EXISTS fornyelse_besluttet_af uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS fornyelse_besluttet_at timestamptz,
  ADD COLUMN IF NOT EXISTS fornyelse_note text;

-- Præcis to gyldige beslutninger; NULL forbliver tilladt ("ikke besluttet").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_fornyelse_beslutning_check'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_fornyelse_beslutning_check
      CHECK (fornyelse_beslutning = ANY (ARRAY['tilbyd'::text, 'tilbyd_ikke'::text]));
  END IF;
END $$;

COMMENT ON COLUMN public.companies.fornyelse_beslutning IS
  'Rådgiverens beslutning om forlængelsestilbud: ''tilbyd'' eller ''tilbyd_ikke''. NULL = ingen beslutning truffet — intet må sendes automatisk på NULL; den sikre standard er tavshed.';
COMMENT ON COLUMN public.companies.fornyelse_besluttet_af IS
  'Den rådgiver (auth.users.id) der traf fornyelsesbeslutningen.';
COMMENT ON COLUMN public.companies.fornyelse_besluttet_at IS
  'Tidspunkt for fornyelsesbeslutningen.';
COMMENT ON COLUMN public.companies.fornyelse_note IS
  'Rådgiverens egen begrundelse for fornyelsesbeslutningen.';
