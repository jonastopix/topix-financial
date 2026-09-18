-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- AFKLARINGSSAMTALEN VÆLGES I PLATFORMEN OG OPRETTES I CALENDLY (udkast
-- 18/9-2026, rev. 2 efter Jonas: Calendly er synkroniseret med hans Google-
-- kalender begge veje, og det må ikke mistes). Platformen ejer derfor INGEN
-- vinduer eller blokeringer (rev. 1's to tabeller udgik). To ting:
--
--   ansoegninger.samtale_link          Meet-linket fra Calendly-eventet, læst
--                                      når bookingen oprettes (samtaleTider.
--                                      bookIKalenderen). Vises på ansøgerens
--                                      side og i i dag/i morgen-mailene.
--   ansoegninger_samtale_start_uidx    DATABASENS værn mod to ansøgere på
--                                      samme slot inde i platformen: UNIQUE
--                                      (samtale_start) WHERE trin = 'booket'.
--                                      Calendly er den ene sandhed for tiden,
--                                      men to kald i samme sekund kan begge få
--                                      «ledig» tilbage — indekset er sidste
--                                      dommer (motoren fanger 23505 → 409),
--                                      og den tabende Calendly-booking aflyses
--                                      igen (kompensation i ansoegning-samtale).
--                                      Alle samtaler ligger på samme 30-min-net,
--                                      så lighed på start = overlap; btree_gist/
--                                      EXCLUDE er ikke nødvendigt.
--
-- Ingen RLS-ændring (kolonnen ligger under de eksisterende politikker på
-- ansoegninger; protect-triggeren dækker den ikke — som afslagsgrund og
-- paa_pause_til: tages med i én senere migration). Ingen SECURITY DEFINER.
--
-- FØR-SQL (ét resultatsæt):
--   select '1 kolonne' as sektion, column_name as noegle, data_type as vaerdi from information_schema.columns
--    where table_schema='public' and table_name='ansoegninger' and column_name='samtale_link'
--   union all
--   select '2 indeks', indexname, indexdef from pg_indexes
--    where schemaname='public' and tablename='ansoegninger' and indexname='ansoegninger_samtale_start_uidx'
--   union all
--   select '3 dubletter', coalesce(samtale_start::text,'-'), count(*)::text from public.ansoegninger
--    where trin='booket' and samtale_start is not null group by samtale_start having count(*) > 1
--   union all
--   select '4 booket', 'antal', count(*)::text from public.ansoegninger where trin='booket'
--   order by 1, 2;
--   FACIT FØR: sektion 1 = ingen; sektion 2 = ingen; sektion 3 = INGEN rækker (findes én, STOP: to
--   bookede på samme tid fra Calendly-tiden — ret i hånden før indekset); sektion 4 = information.
--   FØR-CSV: (indsættes her)
-- EFTER-SQL: samme — FACIT EFTER: sektion 1 = samtale_link · text; sektion 2 = 1 række.
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK:
--   drop index if exists public.ansoegninger_samtale_start_uidx;
--   alter table public.ansoegninger drop column if exists samtale_link;
-- (Ingen datatab ud over Meet-linkene; bookingerne står i Calendly og som samtale_start.)

alter table public.ansoegninger
  add column if not exists samtale_link text;

comment on column public.ansoegninger.samtale_link is
  'Meet-linket fra Calendly-eventet bag afklaringssamtalen (samtalen vælges i platformen, oprettes i Calendly — 18/9-2026). NULL når ingen samtale er booket eller linket ikke kunne læses. Sættes af motoren (udfoerOvergang book/aflys_booking).';

create unique index if not exists ansoegninger_samtale_start_uidx
  on public.ansoegninger (samtale_start)
  where trin = 'booket' and samtale_start is not null;

select '1 kolonne' as sektion, column_name as noegle, data_type as vaerdi from information_schema.columns
 where table_schema='public' and table_name='ansoegninger' and column_name='samtale_link'
union all
select '2 indeks', indexname, indexdef from pg_indexes
 where schemaname='public' and tablename='ansoegninger' and indexname='ansoegninger_samtale_start_uidx'
order by 1, 2;
