-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «Sæt på pause til <dato>» (Jonas 18/9, den varige vej): en NY
-- menneskehandling i ansøgningsmotoren — rådgiveren sætter eller flytter
-- pausen til en dato fra ethvert åbent trin (ansoegningTrin.ts:
-- saet_pause). Sporet (ansoegning_beslutninger) skal kunne bære den:
-- CHECK'en på handling opregner de tretten hidtidige; den fjortende
-- tilføjes her. Uden denne migration udføres overgangen stadig (motoren
-- logger «beslutning kunne ikke skrives» og fortsætter), men sporet
-- mangler linjen — derfor køres den FØR knappen tages i brug.
--
-- FØR-SQL (ét resultatsæt):
--   select conname, pg_get_constraintdef(oid) as def
--     from pg_constraint where conrelid = 'public.ansoegning_beslutninger'::regclass and conname = 'ansoegning_beslutninger_handling_check';
--   FACIT FØR: 1 række; def indeholder 'genaabn' men IKKE 'saet_pause'.
-- EFTER-SQL: samme — FACIT EFTER: def indeholder 'saet_pause'.
--
-- ROLLBACK (kun hvis ingen række bærer saet_pause):
--   alter table public.ansoegning_beslutninger drop constraint ansoegning_beslutninger_handling_check;
--   alter table public.ansoegning_beslutninger add constraint ansoegning_beslutninger_handling_check
--     check (handling in ('tal_med_dem', 'afvis', 'book', 'aflys_booking', 'afholdt', 'tilbud', 'afslag', 'underskrevet', 'svarer_ikke', 'udloeb', 'ikke_nu', 'luk', 'genaabn'));

alter table public.ansoegning_beslutninger drop constraint if exists ansoegning_beslutninger_handling_check;
alter table public.ansoegning_beslutninger add constraint ansoegning_beslutninger_handling_check
  check (handling in ('tal_med_dem', 'afvis', 'book', 'aflys_booking', 'afholdt', 'tilbud', 'afslag', 'underskrevet', 'svarer_ikke', 'udloeb', 'ikke_nu', 'luk', 'genaabn', 'saet_pause'));

select conname, pg_get_constraintdef(oid) as def
  from pg_constraint where conrelid = 'public.ansoegning_beslutninger'::regclass and conname = 'ansoegning_beslutninger_handling_check';
