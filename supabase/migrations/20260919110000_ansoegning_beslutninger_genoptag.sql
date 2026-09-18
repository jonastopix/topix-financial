-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge — FØR functionerne
-- ansoegning-link, ansoegning-handling og ansoegning-rykker-cron udrulles.
--
-- «Genoptag nu» (18/9 aften, hul fundet i Jonas' prøve): en pause kunne hverken
-- tages af rådgiveren eller ansøgeren før datoen — «ikke nu» var bygget som en
-- udvej, ikke som en spærring. Motoren får ÉN ny handlingsart, genoptag
-- (ansoegningTrin.ts), som rådgiveren (knappen), ansøgeren (statussiden) og
-- køen (pause_slut på datoen) alle går igennem. Sporet (ansoegning_beslutninger)
-- skal kunne bære den: CHECK'en på handling opregner de fjorten hidtidige; den
-- femtende tilføjes her. Uden denne migration udføres overgangen stadig
-- (motoren logger «beslutning kunne ikke skrives» og fortsætter), men sporet
-- mangler linjen — derfor køres den FØR knapperne tages i brug.
-- Kildeværnet enumsMatcherDatabasen.guard læser denne liste mod koden.
--
-- FØR-SQL (ét resultatsæt):
--   select conname, pg_get_constraintdef(oid) as def
--     from pg_constraint where conrelid = 'public.ansoegning_beslutninger'::regclass and conname = 'ansoegning_beslutninger_handling_check';
--   FACIT FØR: 1 række; def indeholder 'saet_pause' men IKKE 'genoptag'.
-- EFTER-SQL: samme — FACIT EFTER: def indeholder 'genoptag'.
--
-- ROLLBACK (kun hvis ingen række bærer genoptag):
--   alter table public.ansoegning_beslutninger drop constraint ansoegning_beslutninger_handling_check;
--   alter table public.ansoegning_beslutninger add constraint ansoegning_beslutninger_handling_check
--     check (handling in ('tal_med_dem', 'afvis', 'book', 'aflys_booking', 'afholdt', 'tilbud', 'afslag', 'underskrevet', 'svarer_ikke', 'udloeb', 'ikke_nu', 'luk', 'genaabn', 'saet_pause'));

alter table public.ansoegning_beslutninger drop constraint if exists ansoegning_beslutninger_handling_check;
alter table public.ansoegning_beslutninger add constraint ansoegning_beslutninger_handling_check
  check (handling in ('tal_med_dem', 'afvis', 'book', 'aflys_booking', 'afholdt', 'tilbud', 'afslag', 'underskrevet', 'svarer_ikke', 'udloeb', 'ikke_nu', 'luk', 'genaabn', 'saet_pause', 'genoptag'));

select conname, pg_get_constraintdef(oid) as def
  from pg_constraint where conrelid = 'public.ansoegning_beslutninger'::regclass and conname = 'ansoegning_beslutninger_handling_check';
