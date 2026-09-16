-- Migration: company_actions.status uden overgangsværdierne 'open' og 'parked'.
-- «Én plan pr. virksomhed», fase 0c (plan-en-plan.md §4; recon-opgaver-og-
-- milestones.md §6.6). 20260822220000:31-37 sagde: «'open' og 'parked'
-- fjernes i spor 2 efter datamigreringen» — det skete aldrig; motoren
-- (opgaveEngine.ts:97-98) giver dem tomme overgange, «Dine aftaler» henter
-- 'open' men viser dem ikke. Målt i prod 16/9 19:03 (query-results-export-
-- 2026-09-16_19-03-17.csv, sektion «1b company_actions alle»): active 5,
-- dismissed 15, done 11, dropped 2, expired 122, proposed 43 — INGEN open,
-- INGEN parked. CHECK'en strammes til de syv besluttede tilstande (§7).
--
-- DROP CONSTRAINT-begrundelse (CLAUDE.md): constrainten genskabes i samme
-- migration med det smallere værdisæt; ingen policy røres.
--
-- VÆRN: findes der alligevel rækker med open/parked, STOPPER migrationen
-- (RAISE) uden at ændre noget — de skal migreres først (spor 2-beslutningen:
-- open → proposed eller dismissed; parked → dismissed) og det er en ny
-- beslutning, ikke denne migration.
--
-- IKKE KØRT. DEPLOY: manuelt i Lovable -> SQL editor efter merge (CLAUDE.md —
-- migrationer auto-deployer aldrig). Rækkefølge: FØR-SQL → migrationen →
-- EFTER-SQL; bogfør begge CSV'er.
--
-- FØR (ét resultatsæt; sektion · noegle · vaerdi):
--   select '1 status' as sektion, status as noegle, count(*)::text as vaerdi
--     from public.company_actions group by 1, 2
--   union all
--   select '2 constraint', conname, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid = 'public.company_actions'::regclass and conname = 'company_actions_status_check'
--   union all
--   select '3 open_parked', 'raekker', count(*)::text
--     from public.company_actions where status in ('open','parked')
--   order by 1, 2;
--   FACIT FØR: sektion 3 = 0 (ellers STOP — migrationen vil selv RAISE);
--   sektion 2 nævner 'open' og 'parked'.
--
-- EFTER (samme SQL): sektion 2 uden 'open'/'parked' — ordret:
--   CHECK ((status = ANY (ARRAY['proposed'::text, 'active'::text, 'done'::text, 'not_done'::text, 'dropped'::text, 'dismissed'::text, 'expired'::text])))
--   sektion 1 uændret; sektion 3 = 0.
--
-- Revert:
--   alter table public.company_actions drop constraint if exists company_actions_status_check;
--   alter table public.company_actions add constraint company_actions_status_check
--     check (status = any (array['proposed','active','done','not_done','dropped','dismissed','expired','open','parked']));
--
-- Efterfølgende (ikke i denne migration): typerne OpgaveStatus i
-- src/lib/opgaveEngine.ts og _shared/opgaveEngine.ts bærer stadig
-- 'open' | 'parked' (paritetstesten opgaveEngineSpejl.paritet.test.ts
-- itererer over dem) og VirksomhedView.tsx:328 tæller 'open' med — de
-- ryddes i fase 1 sammen med maal_id, når motoren alligevel røres.

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.company_actions WHERE status IN ('open', 'parked');
  IF n <> 0 THEN
    RAISE EXCEPTION 'company_actions: % raekker har status open/parked — STOP, migrer dem foerst (spor 2-beslutningen)', n;
  END IF;
END $$;

ALTER TABLE public.company_actions
  DROP CONSTRAINT IF EXISTS company_actions_status_check;
ALTER TABLE public.company_actions
  ADD CONSTRAINT company_actions_status_check
  CHECK (status = ANY (ARRAY['proposed','active','done','not_done','dropped','dismissed','expired']));

-- Efter-verifikation (kør med det samme):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.company_actions'::regclass AND conname = 'company_actions_status_check';
