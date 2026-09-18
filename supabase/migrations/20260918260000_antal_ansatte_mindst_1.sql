-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge.
--
-- «Hvor mange er I?» (Jonas 18/9, valg A): ansatte MED ejeren, så tallet kan
-- sammenlignes med CVR-registret. Alene = 1. Før stod der «Skriv 0, hvis du er
-- alene» — selvmodsigende, når ejeren tælles med. Formularen afviser nu 0
-- (validerFelt, spejlet), og tabellen skal sige det samme: mindst 1.
--
-- Gamle svar på 0 (fra før 18/9) betød «alene» og bliver til 1 — samme
-- betydning, nyt tal. Målt i koden: anbefalingen bruger tallet KUN som
-- grundlagstekst (ansoegningAnbefaling.ts), aldrig som kriterium, så ingen
-- dom ændres af opdateringen.
--
-- FØR-SQL (gem svaret):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.ansoegninger'::regclass and conname like '%antal_ansatte%';
--   -- forventet: ansoegninger_antal_ansatte_check · CHECK ((antal_ansatte IS NULL) OR ((antal_ansatte >= 0) AND (antal_ansatte <= 999999)))
--   select count(*) as nul_svar from public.ansoegninger where antal_ansatte = 0;

update public.ansoegninger set antal_ansatte = 1 where antal_ansatte = 0;

alter table public.ansoegninger drop constraint if exists ansoegninger_antal_ansatte_check;
alter table public.ansoegninger add constraint ansoegninger_antal_ansatte_check
  check (antal_ansatte is null or antal_ansatte between 1 and 999999);

comment on column public.ansoegninger.antal_ansatte is
  'Ansatte, ejeren medregnet (Jonas 18/9, valg A): 1 = alene. Mindst 1 — 0 er ikke et svar. Sammenlignes med CVR-registrets interval (cvr_opslag.antal_ansatte, tekst som «10-19»).';

-- EFTER-SQL:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'ansoegninger_antal_ansatte_check';
--   -- forventet: CHECK ((antal_ansatte IS NULL) OR ((antal_ansatte >= 1) AND (antal_ansatte <= 999999)))
--   select count(*) from public.ansoegninger where antal_ansatte = 0;   -- 0
-- ROLLBACK: drop + add med «between 0 and 999999» (0-svarene kan ikke genskabes — de er 1 nu, samme betydning).
