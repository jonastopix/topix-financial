-- KØRT i prod — 28/9-2026 kl. 13:18 (Jonas, Lovable SQL editor). EFTER: CHECK'en har seks kilder; fordeling målt: webinar 6 · andet 5 · direkte 3. Sitet (theboardroom.dk #5, 13:19) sender ordet fra samme øjeblik.
-- OG FØR theboardroom.dk sender ordet: sitet skal først rettes, når denne er kørt
-- i prod — ellers lander hver ansøgning med ?kilde=nyhedsbrev som «andet».
--
-- KILDEN «nyhedsbrev» (besluttet af Jonas 28/9-2026): et link i Klaviyo-mailene
-- (`?kilde=nyhedsbrev`, eller `utm_source` med «klaviyo»/«nyhedsbrev») skal give
-- ansøgningen kilden «nyhedsbrev» — ikke «direkte» (sitet overskrev den) og ikke
-- «andet» (platformen kendte ikke ordet).
--
-- ÉN CHECK RØRES, ingen rækker: ansoegninger_kilde_check får 'nyhedsbrev'.
-- Listen er ordret KILDER i src/lib/ansoegning/skema.ts og
-- _shared/ansoegningSkema.ts (og ansoegningTrin.ts i begge spejle);
-- kildeværnet enumsMatcherDatabasen.guard sammenligner koden med den seneste
-- CHECK i migrationerne.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 check' as sektion, conname as noegle, pg_get_constraintdef(oid) as vaerdi
--     from pg_constraint
--    where conrelid = 'public.ansoegninger'::regclass and conname like '%kilde%'
--   union all
--   select '2 kilder i brug', kilde, count(*)::text from public.ansoegninger group by kilde
--   order by 1, 2;
--   FACIT FØR: sektion 1 = ansoegninger_kilde_check med FEM ord, uden 'nyhedsbrev';
--   sektion 2 = de kilder, der står i tabellen i dag.
-- EFTER-SQL: samme. FACIT EFTER: sektion 1's CHECK nævner alle SEKS; sektion 2
--   uændret (migrationen rører ingen rækker).
--
-- ROLLBACK (kun muligt, hvis ingen række har kilde = 'nyhedsbrev'):
--   alter table public.ansoegninger drop constraint ansoegninger_kilde_check;
--   alter table public.ansoegninger add constraint ansoegninger_kilde_check
--     check (kilde in ('webinar', 'anbefaling', 'linkedin', 'direkte', 'andet'));

alter table public.ansoegninger
  drop constraint if exists ansoegninger_kilde_check;

alter table public.ansoegninger
  add constraint ansoegninger_kilde_check
  check (kilde in ('webinar', 'anbefaling', 'linkedin', 'nyhedsbrev', 'direkte', 'andet'));

comment on column public.ansoegninger.kilde is
  'Hvor ansøgeren kom fra, afgjort af afgoerKilde ved oprettelsen: webinar · anbefaling · linkedin · nyhedsbrev (28/9-2026: ?kilde=nyhedsbrev eller utm_source klaviyo/nyhedsbrev) · direkte · andet. Det rå ord står i kilde_raa.';

-- EFTER-tjek (kør og gem CSV):
select '1 check' as sektion, conname as noegle, pg_get_constraintdef(oid) as vaerdi
  from pg_constraint
 where conrelid = 'public.ansoegninger'::regclass and conname like '%kilde%'
union all
select '2 kilder i brug', kilde, count(*)::text from public.ansoegninger group by kilde
 order by 1, 2;
