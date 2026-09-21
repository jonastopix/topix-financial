-- KØRT i prod — 21/9-2026 kl. 23:20 (Jonas, Lovable SQL editor), før udrulningen, med en vagt først. EFTER: art-CHECK med started, submitted, kvalificeret, booket, purchase; 0 rækker uden for.
--
-- META TRIN 2: TRE HÆNDELSER MERE I SPORET (22/9-2026, Jonas 21/9 22:25).
--
-- HVAD: art-CHECK'en på public.meta_haendelser udvides fra to til fem værdier —
--   'kvalificeret'  rådgiverens første «tal_med_dem» (custom event «Kvalificeret»)
--   'booket'        den første «book» på ansøgningen (Metas standardhændelse Schedule)
--   'purchase'      medlemskabets første betaling (Metas standardhændelse Purchase)
--
-- HVORFOR DEN MINDSTE UDVIDELSE ER DEN RIGTIGE: alle tre hændelser hører til en ANSØGNING
-- og har et ansøgnings-id. Tabellens to øvrige værn passer derfor uændret —
--   ansoegning_id uuid not null references public.ansoegninger(id) on delete cascade
--   constraint meta_haendelser_event_id_form check (event_id = ansoegning_id::text || ':' || art)
-- — og event_id'erne «<id>:kvalificeret», «<id>:booket», «<id>:purchase» opfylder formen af
-- sig selv. En ny tabel ville have været nødvendig for WEBINARHÆNDELSER, der ikke har et
-- ansøgnings-id; de er bevidst fravalgt (eWebinars raa bærer ingen user agent, målt i prod
-- 21/9 22:12 over 675 tilmeldinger), og så er der intet at lave en tabel til. Ingen ny
-- tabel, ingen ny kolonne, intet indeks — kun én CHECK.
--
-- IDEMPOTENSEN ER UÆNDRET: event_id er primærnøgle, og maaForsoeges springer 'sendt' og
-- 'ugyldig' over. Én Purchase pr. ansøgning, fordi 'fornyelse' ikke er en indgang.
--
-- RÆKKEFØLGEN: denne migration skal køres EFTER 20260922040000_ansoegninger_meta_udvidelse.sql
-- (trin 1). Tidsstemplet 22/9 kl. 05:00 ligger efter alt i main og efter de to migrationer i
-- udkast-klokke-mail (20260922030000/031000), som endnu ikke er kørt. En migration, der ikke
-- er kørt, må aldrig sortere før en, der er.
--
-- FØR-SQL (ét resultatsæt — kør FØR migrationen, gem CSV):
--   select conname, pg_get_constraintdef(oid) as definition
--     from pg_constraint
--    where conrelid = 'public.meta_haendelser'::regclass and conname = 'meta_haendelser_art_check';
--   FACIT FØR: én række — «CHECK ((art = ANY (ARRAY['started'::text, 'submitted'::text])))».
--
-- ROLLBACK (kun muligt hvis ingen række bærer en af de tre nye arter):
--   alter table public.meta_haendelser drop constraint meta_haendelser_art_check;
--   alter table public.meta_haendelser add constraint meta_haendelser_art_check
--     check (art in ('started', 'submitted'));

alter table public.meta_haendelser drop constraint if exists meta_haendelser_art_check;

alter table public.meta_haendelser add constraint meta_haendelser_art_check
  check (art in ('started', 'submitted', 'kvalificeret', 'booket', 'purchase'));

comment on column public.meta_haendelser.art is
  'started · submitted (website-hændelser fra ansøgningsformularen) · kvalificeret · booket · purchase (CRM-hændelser fra vores eget system, action_source «system_generated»). Trin 2, 22/9-2026.';

-- EFTER-tjek (kør og gem CSV):
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.meta_haendelser'::regclass and conname = 'meta_haendelser_art_check';
-- FACIT EFTER: én række med alle fem værdier.

-- OG MÅLINGEN, at de gamle rækker stadig passer (skal give 0):
select count(*) as raekker_uden_for_check
  from public.meta_haendelser
 where art not in ('started', 'submitted', 'kvalificeret', 'booket', 'purchase');
