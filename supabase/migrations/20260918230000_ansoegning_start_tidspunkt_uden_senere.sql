-- «Senere — jeg vil først vide mere» ud af ansøgningsformularens svar på
-- «Hvornår kan du starte?» (Jonas 18/9 kl. 10:10, ordret: «Alle skal jo
-- igennem afklaringssamtale, så alle skal vide mere. Og vi skal gå efter at
-- få folk i gang hurtigst muligt, for hvis først der går tid efter
-- ansøgningen, så bliver de kolde.»). Tre svar om TID tilbage:
-- hurtigst_muligt · inden_1_maaned · inden_3_maaneder.
--
-- Værdien er låst i prod af CHECK'en fra 20260918200000_ansoegninger.sql:141
-- (inline column check → auto-navnet ansoegninger_start_tidspunkt_check),
-- og DEN migration ER kørt i prod 18/9 kl. 10. Derfor denne lille migration.
--
-- IKKE KØRT. Køres manuelt i Lovable → SQL editor (CLAUDE.md). Skema-koden
-- (src/lib/ansoegning/skema.ts + _shared/ansoegningSkema.ts) afviser allerede
-- «senere» ved gem/indsend, så rækkefølgen er ufarlig begge veje: køres
-- migrationen FØR Update-klikket, kan en gammel formular-build ikke gemme
-- «senere» (400 fra ansoegning-gem — «Vælg hvornår du kan starte»); køres
-- den EFTER, ligger der højst rækker med «senere» fra timerne imellem, og
-- FØR-tjekket fanger dem.
--
-- FØR (facit: 0 rækker med 'senere'; constraint-navnet findes):
--   select count(*) as med_senere from public.ansoegninger where start_tidspunkt = 'senere';
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.ansoegninger'::regclass and conname = 'ansoegninger_start_tidspunkt_check';
--   -- Er med_senere > 0: rækkerne sættes til null nedenfor (svaret spørges igen
--   -- ved genoptagelse — afgoerFremdrift ser feltet som ubesvaret). Er
--   -- constraint-navnet et andet: ret DROP-linjen til det målte navn.

begin;

-- Gamle rækker med det udgåede svar: tilbage til «ubesvaret» (formularen
-- spørger igen; anbefalingen tæller «senere» som ukendt fra samme dag).
update public.ansoegninger
   set start_tidspunkt = null
 where start_tidspunkt = 'senere';

alter table public.ansoegninger
  drop constraint if exists ansoegninger_start_tidspunkt_check;

alter table public.ansoegninger
  add constraint ansoegninger_start_tidspunkt_check
  check (start_tidspunkt is null or start_tidspunkt in ('hurtigst_muligt','inden_1_maaned','inden_3_maaneder'));

commit;

-- EFTER (facit):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.ansoegninger'::regclass and conname = 'ansoegninger_start_tidspunkt_check';
--   -- → CHECK ((start_tidspunkt IS NULL) OR (start_tidspunkt = ANY (ARRAY['hurtigst_muligt'::text, 'inden_1_maaned'::text, 'inden_3_maaneder'::text])))
--   select count(*) from public.ansoegninger where start_tidspunkt = 'senere';  -- 0
--
-- ROLLBACK (hvis nødvendigt):
--   alter table public.ansoegninger drop constraint if exists ansoegninger_start_tidspunkt_check;
--   alter table public.ansoegninger add constraint ansoegninger_start_tidspunkt_check
--     check (start_tidspunkt is null or start_tidspunkt in ('hurtigst_muligt','inden_1_maaned','inden_3_maaneder','senere'));
