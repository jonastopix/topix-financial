-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor, FØR koden merges — rykkerkøen
-- ville ellers forsøge at skrive rækker med trappe 'ny'/'afholdt', som databasen afviser,
-- og rådgiver-rykkerne ville aldrig gå (samme hul som «indsendt», #992: 0 rækker, 0 mails).
--
-- HVORFOR (20/9-2026, recon-ansoegningsmails §5): rådgiveren var den eneste i forløbet, der
-- aldrig blev rykket. To nye trapper til kontakt@: «ny» (dag 3 og 7 efter indsendelsen, så
-- længe ingen har trykket «tal med dem»/«afvis») og «afholdt» (dag 2 efter samtalen, så
-- længe tilbud/afslag/«kom ikke» udestår). Værnet enumsMatcherDatabasen.guard læser den
-- SENESTE check-liste i migrationerne og kræver, at den er lig TRAPPER_NAVNE i koden.

alter table public.planlagte_haendelser drop constraint if exists planlagte_haendelser_trappe_check;
alter table public.planlagte_haendelser add constraint planlagte_haendelser_trappe_check
  check (trappe in ('kladde', 'indsendt', 'ny', 'indkaldt', 'booket', 'afholdt', 'aftalegrundlag', 'pause', 'venteplads', 'afslag'));

-- EFTER-SQL:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.planlagte_haendelser'::regclass and conname='planlagte_haendelser_trappe_check';
--   -- skal indeholde 'ny' og 'afholdt'
