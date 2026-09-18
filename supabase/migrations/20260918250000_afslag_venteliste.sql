-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge. Forudsætter
-- C's 20260918240000 (ventelisten) — KØRT i prod 18/9 (#989) — se «unionen».
--
-- AFSLAGET BLIVER TIL NOGET (Jonas 17/9 nat, 18/9): et nej bærer en grund —
-- nichen er optaget (C's venteliste, tabellen ventepladser), for tidligt
-- eller andet. «Svarer ikke» giver intet. Abonnementet «Dine tal» er taget
-- helt ud (Jonas 18/9) — ingen kolonne, ingen trappe, ingen handling.
--   ansoegninger.afslagsgrund    niche | for_tidligt | andet — grunden bag
--                                nej'et; «værd at kende, også uden tilbud»
--   planlagte_haendelser.trappe  + 'afslag' (afslagsmailen dag 0) — og C's
--                                'venteplads'
-- ansoegning_beslutninger.handling er UÆNDRET: afvis/afslag findes allerede.
--
-- UNIONEN: C's 20260918240000 (KØRT) satte CHECK'en på planlagte_haendelser.
-- trappe til ('kladde','indkaldt','booket','aftalegrundlag','pause','venteplads').
-- Denne skriver den om med ALLE C's værdier plus 'afslag' — mangler én af
-- C's, ryger ventelistens rækker. FØR-SQL'ens sektion 2 skal vise C's liste
-- ordret; EFTER-SQL'ens sektion 2 den samme plus 'afslag'.
--
-- PROTECT-TRIGGEREN (protect_ansoegning_motor_fields, 20260918200000) dækker
-- IKKE afslagsgrund — som paa_pause_til. Jonas 18/9: udækket nu; tages med i
-- én senere migration sammen med paa_pause_til.
--
-- FØR-SQL (ét resultatsæt):
--   select '1 kolonne' as sektion, column_name as noegle, data_type as vaerdi from information_schema.columns
--    where table_schema='public' and table_name='ansoegninger' and column_name = 'afslagsgrund'
--   union all
--   select '2 trappe-check', conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.planlagte_haendelser'::regclass and conname='planlagte_haendelser_trappe_check'
--   union all
--   select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 = ingen rækker; sektion 2 = C's liste ('kladde', 'indkaldt', 'booket', 'aftalegrundlag', 'pause', 'venteplads') — afviger den, STOP.
--   FØR-CSV: (indsættes her)
-- EFTER-SQL: samme — FACIT EFTER: sektion 1 = 1 række (text); sektion 2 indeholder 'afslag' og 'venteplads'.
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK (kun hvis ingen planlagte_haendelser-række bærer trappe = 'afslag'):
--   alter table public.ansoegninger drop column if exists afslagsgrund;
--   alter table public.planlagte_haendelser drop constraint if exists planlagte_haendelser_trappe_check;
--   alter table public.planlagte_haendelser add constraint planlagte_haendelser_trappe_check
--     check (trappe in ('kladde', 'indkaldt', 'booket', 'aftalegrundlag', 'pause', 'venteplads'));

alter table public.ansoegninger
  add column if not exists afslagsgrund text;

alter table public.ansoegninger drop constraint if exists ansoegninger_afslagsgrund_check;
alter table public.ansoegninger add constraint ansoegninger_afslagsgrund_check
  check (afslagsgrund is null or afslagsgrund in ('niche', 'for_tidligt', 'andet'));

comment on column public.ansoegninger.afslagsgrund is
  'Grunden bag et nej (afvis/afslag): niche = nichen er optaget (ventelisten, C), for_tidligt, andet (ingen mail — Jonas skriver selv). Skrives af motoren gennem ansoegning-handling; ikke dækket af protect-triggeren endnu (18/9-2026).';

alter table public.planlagte_haendelser drop constraint if exists planlagte_haendelser_trappe_check;
alter table public.planlagte_haendelser add constraint planlagte_haendelser_trappe_check
  check (trappe in ('kladde', 'indkaldt', 'booket', 'aftalegrundlag', 'pause', 'venteplads', 'afslag'));

select '1 kolonne' as sektion, column_name as noegle, data_type as vaerdi from information_schema.columns
 where table_schema='public' and table_name='ansoegninger' and column_name = 'afslagsgrund'
union all
select '2 trappe-check', conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.planlagte_haendelser'::regclass and conname='planlagte_haendelser_trappe_check'
order by 1, 2;
