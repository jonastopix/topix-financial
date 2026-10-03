-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- OG FØR meta-send-cron UDRULLES — og FØRST, når skive 1 (20261003010000) er kørt (porten nedenfor).
--
-- WEBINARMOTORENS TILMELDINGER I METAS SPOR (udkast 3/10-2026; docs/webinarmotor.md §7.9,
-- docs/tracking.md §2 række 28; Jonas' D2.3: pixel + Conversions API bag låsen).
-- meta-send-cron får et andet pas: CompleteRegistration for motorens egne tilmeldinger,
-- event_id «<tilmelding_id>:registration», art «registration». Sporet er det SAMME
-- (public.meta_haendelser) — én idempotens, én alarm, og driftsagenten (driftDom.ts SPOR)
-- ser rækkerne uden ændring.
--
-- MÅLT FØR BYGNINGEN (kodelæst i de kørte migrationer, ikke i prod):
--   20260921234000: ansoegning_id uuid NOT NULL references ansoegninger on delete cascade ·
--     meta_haendelser_event_id_form CHECK (event_id = ansoegning_id::text || ':' || art) ·
--     udfald-CHECK, sendt_hel, forsoeg.
--   20260922050000 (den SENESTE, der rører art-CHECK'en, KØRT 21/9 23:20):
--     meta_haendelser_art_check CHECK (art in ('started','submitted','kvalificeret','booket','purchase')).
-- DERFOR ER DET MERE END ART-CHECK'EN: en tilmelding har intet ansøgnings-id. Tre ting skal
-- med, ellers afviser sporet rækken — 23502 (ansoegning_id NOT NULL) før 23514 (art):
--   1. ny kolonne tilmelding_id uuid references webinar_tilmeldinger(id) on delete cascade
--      (sletning af en tilmelding tager sporet med, som ansøgningens gør);
--   2. ansoegning_id drop not null + ejerreglen: PRÆCIS én af de to (meta_haendelser_ejer_xor),
--      og art 'registration' ⇔ tilmelding_id (meta_haendelser_art_ejer);
--   3. event_id-formen på coalesce(ansoegning_id, tilmelding_id) — STRAMMERE end i dag: den
--      gamle form gav NULL (= bestået) for en række uden ansoegning_id.
-- ALLE eksisterende rækker opfylder de nye regler (ansoegning_id sat, tilmelding_id null, art
-- en af de fem); EFTER-SQL'en tæller dem.
--
-- LÅSEN app_config.webinarmotor_meta_aktiv = false (ON CONFLICT DO NOTHING) — tilmeldingernes
-- EGEN lås, ud over meta_send_aktiv. Rækken er også PORTEN: meta-send-cron sender ingen
-- tilmelding (heller ikke med test_event_code), før rækken findes (_shared/metaTilmelding.ts,
-- laesWebinarLaas → port «klar»). Låsen ÅBNES FØRST, NÅR PRIVATLIVSTEKSTEN PÅ topix.dk ER
-- PUBLICERET (B4) — i dag lover den «Selve din tilmelding deler vi ikke med Meta».
--
-- HVIS FUNCTIONEN UDRULLES FØR DENNE MIGRATION: porten står på «migration_mangler», og
-- tilmeldingspasset sender intet (svaret: tilmeldinger.port). Uden porten ville en testhændelse
-- være nået til Meta, sporets række afvist (23502/23514), og næste testkørsel have sendt den
-- igen — Meta dedupper på event_id, men vinduet for det er IKKE slået op i denne session, og
-- huset mistede sin egen optegnelse (driftsagenten ser kun rækker, der står i sporet).
--
-- ÉN TRANSAKTION (begin … commit), ÉT alter table: CHECK'en er aldrig væk et øjeblik, og en
-- fejl midt i ruller det hele tilbage. Kan køres igen (if not exists / drop if exists).
--
-- FØR-SQL (ét resultatsæt — kør FØR, gem CSV):
--   select '1 art_check' as sektion, pg_get_constraintdef(oid) as vaerdi from pg_constraint
--    where conrelid = 'public.meta_haendelser'::regclass and conname = 'meta_haendelser_art_check'
--   union all
--   select '2 event_id_form', pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.meta_haendelser'::regclass and conname = 'meta_haendelser_event_id_form'
--   union all
--   select '3 ansoegning_id is_nullable', is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'meta_haendelser' and column_name = 'ansoegning_id'
--   union all
--   select '4 tilmelding_id findes', count(*)::text from information_schema.columns
--    where table_schema = 'public' and table_name = 'meta_haendelser' and column_name = 'tilmelding_id'
--   union all
--   select '5 laas', coalesce((select config_value::text from public.app_config where config_key = 'webinarmotor_meta_aktiv'), 'ikke sat')
--   union all
--   select '6 skive1 kilde_system', count(*)::text from information_schema.columns
--    where table_schema = 'public' and table_name = 'webinar_tilmeldinger' and column_name = 'kilde_system'
--   union all
--   select concat('7 raekker art ', art), count(*)::text from public.meta_haendelser group by art;
-- FACIT FØR: 1 = de fem arter (started … purchase) · 2 = formen på ansoegning_id alene ·
--   3 = «NO» · 4 = «0» · 5 = «ikke sat» · 6 = «1» (ellers: STOP — skive 1 er ikke kørt, og
--   migrationen nedenfor afviser sig selv) · 7 = én linje pr. art, ingen «registration».
--
-- ROLLBACK (kun muligt, mens INGEN række har art 'registration' — ellers afviser NOT NULL og
-- CHECK'en dem; sletningen af de rækker er en beslutning, ikke en del af rollbacken):
--   begin;
--   alter table public.meta_haendelser
--     drop constraint if exists meta_haendelser_art_ejer,
--     drop constraint if exists meta_haendelser_ejer_xor,
--     drop constraint if exists meta_haendelser_event_id_form,
--     add constraint meta_haendelser_event_id_form check (event_id = ansoegning_id::text || ':' || art),
--     drop constraint if exists meta_haendelser_art_check,
--     add constraint meta_haendelser_art_check check (art in ('started', 'submitted', 'kvalificeret', 'booket', 'purchase')),
--     alter column ansoegning_id set not null,
--     drop column if exists tilmelding_id;
--   delete from public.app_config where config_key = 'webinarmotor_meta_aktiv' and config_value = 'false'::jsonb;
--   commit;

begin;

-- PORTEN: skive 1 skal være kørt (kolonnerne, tilmeldingspasset læser). Ellers STOP.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'webinar_tilmeldinger' and column_name = 'kilde_system'
  ) then
    raise exception 'STOP: webinar_tilmeldinger.kilde_system mangler — kør skive 1 (20261003010000) først';
  end if;
end $$;

alter table public.meta_haendelser
  add column if not exists tilmelding_id uuid references public.webinar_tilmeldinger(id) on delete cascade,
  alter column ansoegning_id drop not null,
  drop constraint if exists meta_haendelser_art_check,
  add constraint meta_haendelser_art_check
    check (art in ('started', 'submitted', 'kvalificeret', 'booket', 'purchase', 'registration')),
  drop constraint if exists meta_haendelser_event_id_form,
  add constraint meta_haendelser_event_id_form
    check (event_id = coalesce(ansoegning_id, tilmelding_id)::text || ':' || art),
  drop constraint if exists meta_haendelser_ejer_xor,
  add constraint meta_haendelser_ejer_xor
    check ((ansoegning_id is null) <> (tilmelding_id is null)),
  drop constraint if exists meta_haendelser_art_ejer,
  add constraint meta_haendelser_art_ejer
    check ((art = 'registration') = (tilmelding_id is not null));

create index if not exists meta_haendelser_tilmelding_idx
  on public.meta_haendelser (tilmelding_id) where tilmelding_id is not null;

comment on column public.meta_haendelser.art is
  'started · submitted (website-hændelser fra ansøgningsformularen) · kvalificeret · booket · purchase (CRM-hændelser, action_source «system_generated») · registration (webinarmotorens tilmelding, CompleteRegistration, website — 3/10-2026, bag låsen webinarmotor_meta_aktiv).';
comment on column public.meta_haendelser.tilmelding_id is
  'Webinarmotorens tilmelding (art registration). Præcis én af ansoegning_id og tilmelding_id er sat (meta_haendelser_ejer_xor). 3/10-2026.';

insert into public.app_config (config_key, config_value, description)
values ('webinarmotor_meta_aktiv', 'false'::jsonb,
  'Webinarmotorens tilmeldinger til Metas Conversions API (CompleteRegistration): sender meta-send-cron dem for alvor? false = nej (standard). Kræver OGSÅ meta_send_aktiv = true. Åbnes FØRST, når privatlivsteksten på topix.dk er publiceret (B4) og en testhændelse er set i Events Manager (3/10-2026). Rækken er også porten: uden den sendes ingen tilmelding.')
on conflict (config_key) do nothing;

commit;

-- EFTER-SQL (ét resultatsæt — kør og gem CSV):
select '1 art_check' as sektion, pg_get_constraintdef(oid) as vaerdi from pg_constraint
 where conrelid = 'public.meta_haendelser'::regclass and conname = 'meta_haendelser_art_check'
union all
select '2 event_id_form', pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.meta_haendelser'::regclass and conname = 'meta_haendelser_event_id_form'
union all
select '3 ejer_xor', pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.meta_haendelser'::regclass and conname = 'meta_haendelser_ejer_xor'
union all
select '4 art_ejer', pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.meta_haendelser'::regclass and conname = 'meta_haendelser_art_ejer'
union all
select '5 ansoegning_id is_nullable', is_nullable from information_schema.columns
 where table_schema = 'public' and table_name = 'meta_haendelser' and column_name = 'ansoegning_id'
union all
select '6 tilmelding_id', data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'meta_haendelser' and column_name = 'tilmelding_id'
union all
select '7 laas', coalesce((select config_value::text from public.app_config where config_key = 'webinarmotor_meta_aktiv'), 'ikke sat')
union all
select '8 raekker uden ejer eller med to', count(*)::text from public.meta_haendelser
 where (ansoegning_id is null) = (tilmelding_id is null)
union all
select concat('9 raekker art ', art), count(*)::text from public.meta_haendelser group by art;
-- FACIT EFTER: 1 = seks arter, «registration» sidst · 2 = formen på coalesce(ansoegning_id,
--   tilmelding_id) · 3 og 4 = de to nye regler · 5 = «YES» · 6 = «uuid» · 7 = «false» ·
--   8 = «0» · 9 = samme tal som FØR sektion 7, ingen «registration».
-- Kolonnen målt fra klienten (husreglen, FØR udrulningen):
--   GET /rest/v1/meta_haendelser?select=tilmelding_id&limit=0  → 200 (42703 = ikke kørt).
--   UMÅLT om anon har tabel-GRANT på sporet; svarer den 401/42501, siger det intet om
--   kolonnen — så er EFTER-SQL'en (sektion 6) målingen.
