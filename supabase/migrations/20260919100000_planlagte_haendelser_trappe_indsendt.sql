-- Kvitteringstrappen «indsendt» (#992, 18/9) kunne ALDRIG skrives: planlagte_haendelser_trappe_check
-- kendte kladde, indkaldt, booket, aftalegrundlag, pause, venteplads, afslag — ikke «indsendt».
-- BEVIST i prod 18/9 17:35: rækker med trappe «indsendt» = 0, kvitteringer i email_send_log = 0.
-- Tredje gang hullet rammes (venteplads 240000, afslag 250000, nu indsendt) — derfor følger et kildeværn
-- (src/lib/__tests__/enumsMatcherDatabasen.guard.test.ts), der læser TRAPPER_NAVNE i koden og den
-- SENESTE CHECK-liste i migrationerne og fejler, når de ikke er ens.
--
-- FØR-SQL (forventet: 7 værdier uden 'indsendt'):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.planlagte_haendelser'::regclass and conname='planlagte_haendelser_trappe_check';
--   select trappe, count(*) from public.planlagte_haendelser group by 1 order by 1;   -- alle eksisterende værdier er i listen nedenfor
-- ROLLBACK (tilbage til de syv):
--   alter table public.planlagte_haendelser drop constraint if exists planlagte_haendelser_trappe_check;
--   alter table public.planlagte_haendelser add constraint planlagte_haendelser_trappe_check
--     check (trappe in ('kladde', 'indkaldt', 'booket', 'aftalegrundlag', 'pause', 'venteplads', 'afslag'));

alter table public.planlagte_haendelser drop constraint if exists planlagte_haendelser_trappe_check;
alter table public.planlagte_haendelser add constraint planlagte_haendelser_trappe_check
  check (trappe in ('kladde', 'indsendt', 'indkaldt', 'booket', 'aftalegrundlag', 'pause', 'venteplads', 'afslag'));

-- EFTER-SQL (forventet: listen ovenfor, 8 værdier):
select pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.planlagte_haendelser'::regclass and conname='planlagte_haendelser_trappe_check';
