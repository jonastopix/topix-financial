-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge — FØR
-- indgangs-paamindelser-cron og ansøgningsflowets functions udrulles.
--
-- DØD PÅ DAG 60 (Jonas 18/9 aften): en underskrevet, ubetalt aftale er død 60
-- dage efter underskriften — fakturaen fra dag 31 er da tredive dage gammel.
-- Betalingsforløbets cron (indgangs-paamindelser-cron, erAftaleDoed) lukker
-- ansøgningen gennem motoren med den nye systemhandling betalte_ikke og den
-- nye lukkeårsag betalte_ikke. To CHECK-lister skal kende værdien:
--   ansoegninger_lukkeaarsag_check         (7 → 8 værdier)
--   ansoegning_beslutninger_handling_check (15 → 16 værdier; genoptag fra 20260919110000)
-- Kildeværnet enumsMatcherDatabasen.guard læser begge lister mod koden.
-- Virksomheden (oprettet ved underskriften) røres IKKE af denne migration.
--
-- FØR-SQL (to rækker):
--   select conname, pg_get_constraintdef(oid) as def from pg_constraint
--     where conname in ('ansoegninger_lukkeaarsag_check', 'ansoegning_beslutninger_handling_check');
--   FACIT FØR: ingen af de to indeholder 'betalte_ikke'; handling-listen indeholder 'genoptag'.
-- EFTER-SQL: samme — FACIT EFTER: begge indeholder 'betalte_ikke'.
--
-- ROLLBACK (kun hvis ingen række bærer betalte_ikke):
--   alter table public.ansoegninger drop constraint ansoegninger_lukkeaarsag_check;
--   alter table public.ansoegninger add constraint ansoegninger_lukkeaarsag_check
--     check (lukkeaarsag is null or lukkeaarsag in ('afslag_efter_ansoegning', 'afslag_efter_samtale', 'svarer_ikke', 'udloebet', 'trak_sig', 'dublet', 'andet'));
--   alter table public.ansoegning_beslutninger drop constraint ansoegning_beslutninger_handling_check;
--   alter table public.ansoegning_beslutninger add constraint ansoegning_beslutninger_handling_check
--     check (handling in ('tal_med_dem', 'afvis', 'book', 'aflys_booking', 'afholdt', 'tilbud', 'afslag', 'underskrevet', 'svarer_ikke', 'udloeb', 'ikke_nu', 'luk', 'genaabn', 'saet_pause', 'genoptag'));

alter table public.ansoegninger drop constraint if exists ansoegninger_lukkeaarsag_check;
alter table public.ansoegninger add constraint ansoegninger_lukkeaarsag_check
  check (lukkeaarsag is null or lukkeaarsag in ('afslag_efter_ansoegning', 'afslag_efter_samtale', 'svarer_ikke', 'udloebet', 'trak_sig', 'dublet', 'andet', 'betalte_ikke'));

alter table public.ansoegning_beslutninger drop constraint if exists ansoegning_beslutninger_handling_check;
alter table public.ansoegning_beslutninger add constraint ansoegning_beslutninger_handling_check
  check (handling in ('tal_med_dem', 'afvis', 'book', 'aflys_booking', 'afholdt', 'tilbud', 'afslag', 'underskrevet', 'svarer_ikke', 'udloeb', 'ikke_nu', 'luk', 'genaabn', 'saet_pause', 'genoptag', 'betalte_ikke'));

select conname, pg_get_constraintdef(oid) as def from pg_constraint
  where conname in ('ansoegninger_lukkeaarsag_check', 'ansoegning_beslutninger_handling_check');
