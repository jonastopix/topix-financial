-- companies.status bindes fast (10/9-2026, recon-sikkerhed-og-toast.md §2).
-- SKREVET, IKKE KØRT. Deploy manuelt i Lovable → SQL editor efter merge.
--
-- KOLONNEN: text DEFAULT 'active' (20260225104718:14), nullable, ingen
-- CHECK. Skrives af ingen kode — kun den manuelle SQL 2/9
-- (20260902113000_status_tidligere.sql), som selv bogførte: «næste gang kan
-- nogen skrive 'Tidligere' eller 'inaktiv', og filtrene virker så
-- tilfældigt». Kolonnen læses NI steder: fire funktioner med
-- .eq("status","active") (send-report-reminder, run-weekly-agent,
-- run-company-agent/peers, berig-virksomheder) og fem i fladen/gaten med
-- (status === 'active' || !status). En stavefejl slukker
-- rapportpåmindelser, ugeagent, berigelse og branche-peers uden lyd.
--
-- MÅLT I PROD 10/9 kl. 19:40 (Jonas): kun 'active' (30) og 'tidligere'
-- (8). Ingen NULL, ingen stavefejl. Begge ALTER går derfor igennem.
--
-- NULL: en CHECK afviser IKKE NULL (NULL er ikke falsk). Funktionerne og
-- fladen er uenige om NULL — funktionerne siger nej, fladen ja — men det er
-- teoretisk i dag (0 NULL). NOT NULL nedenfor gør det umuligt i praksis, og
-- den fejler selv hvis en NULL skulle være kommet til inden kørslen — det
-- er værnet mod at køre i blinde. Fladens «|| !status» bliver død kode,
-- ikke forkert kode; de ni læsere rettes ikke her.
--
-- Revert: ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_status_check;
--         ALTER TABLE public.companies ALTER COLUMN status DROP NOT NULL;

ALTER TABLE public.companies
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_status_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_status_check CHECK (status IN ('active', 'tidligere'));

COMMENT ON COLUMN public.companies.status IS
  'active | tidligere. Styrer rådgiverlisten, rapportpåmindelser, ugeagenten, berigelsen og branche-peers. Skrives kun i hånden (SQL). Nye værdier kræver at CHECK''en udvides FØRST — og at de ni læsere kender værdien.';

-- ── VERIFIKATION ─────────────────────────────────────────────────────────
--   SELECT status, count(*) FROM public.companies GROUP BY status;        -- active 30, tidligere 8
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.companies'::regclass AND conname = 'companies_status_check';
--   SELECT is_nullable, column_default FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'status';  -- NO, 'active'
