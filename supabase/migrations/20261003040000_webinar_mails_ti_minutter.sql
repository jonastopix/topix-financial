-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- OG FØR webinar-mail-cron UDRULLES. Rækkefølgen er ikke pynt: udrulles functionen
-- først, uden porten nedenfor, ville den sende «ti_minutter»-mailen, CHECK'en
-- afvise rækken i sporet (23514, ikke 23505 — tælles som fejl, ikke dublet), og
-- næste kørsel se «ingen ok-række» og sende den IGEN, så længe vinduet
-- (T−30 … T−5 min) er åbent. Samme fælde som fjorten_dage (20260928120000).
-- PORTEN (3/10, CTO-rådets fund 3) fanger det nu i koden: cronen læser
-- app_config.webinar_ti_minutter_klar fail-closed FØR dommen, og uden den er
-- arten ikke med i kørslen (svaret: ti_minutter.port = 'migration_mangler').
--
-- NY MAILART «ti_minutter» (3/10-2026, docs/webinarmotor.md §4 og §8.4 punkt 3):
-- «Vi begynder kl. 11.00 — her er dit link» — KUN for webinarmotorens tilmeldinger
-- (ewebinar_id «P-<uuid>», kilde_system 'platform'). eWebinar sender selv sin
-- 10-minutters-mail til sine tilmeldte; dommen (_shared/webinarMailDom.ts,
-- Plan.kunMotor) giver ALDRIG en eWebinar-række arten.
--
-- TO TING, I ÉN TRANSAKTION (begin … commit — CTO-rådets fund 6: porten må aldrig
-- stå uden CHECK'en, og CHECK'en må aldrig være væk et øjeblik):
--   1. webinar_mails_art_check får 'ti_minutter' (8 arter — ordret
--      _shared/webinarMailDom.ts' ARTER, i samme rækkefølge) i ÉT alter table
--      (drop + add i samme sætning). Ingen rækker røres.
--   2. app_config.webinar_ti_minutter_klar = true, ON CONFLICT DO NOTHING —
--      porten. Findes nøglen, er CHECK'en der.
-- webinar_mails_invitation_arter_check er URØRT: ti_minutter bærer ingen
-- kalenderfil (står ikke i MED_INVITATION), så invitation er altid NULL på den.
-- Kildeværnet webinarMail.guard dom 10 sammenligner listen med koden, dom 21 porten.
--
-- RÆKKEFØLGEN: merge → DENNE migration (FØR/EFTER nedenfor) → eksplicit deploy af
-- webinar-mail-cron fra build-chatten → beviset: en tørkørsel svarer med feltet
-- `ti_minutter` ({ port, ikke_motor, skal_sendes, tabt }) — kun den nye kode har
-- det — og `port` = 'klar'. `ikke_motor` tæller eWebinar-personer (én pr. (mail,
-- session)) blandt de tilmeldinger, cronen LÆSER: session_tid ≥ kørslens nu − 3
-- døgn (cronens `graense`, webinar-mail-cron trin 1). Dommen svarer «ikke_motor»
-- FØR tiden, så MED mindst én eWebinar-tilmelding til en session fra 3 døgn før
-- kørslen og frem (og porten 'klar') er ikke_motor > 0 — uanset hvor langt ude
-- sessionen er. Er der ingen sådan (efter eWebinars sidste session 13/10 + 3
-- døgn), er 0 det rigtige svar. `skal_sendes` er 0, medmindre en motor-session
-- ligger i sit vindue.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 check' as sektion, conname as noegle, pg_get_constraintdef(oid) as vaerdi
--     from pg_constraint
--    where conname = 'webinar_mails_art_check'
--   union all
--   select '2 arter i brug', art, count(*)::text from public.webinar_mails group by art
--   union all
--   select '3 porten', config_key, config_value::text from public.app_config
--    where config_key = 'webinar_ti_minutter_klar'
--   order by 1, 2;
--   FACIT FØR: sektion 1 = CHECK ((art = ANY (ARRAY['bekraeftelse'::text,
--   'fjorten_dage'::text, 'syv_dage'::text, 'tre_dage'::text, 'en_dag'::text,
--   'dagen'::text, 'en_time'::text]))) — SYV arter; sektion 2 uden 'ti_minutter';
--   sektion 3 TOM (ingen række). (Postgres' gengivelse af en IN-liste; formen er
--   ikke målt — ARTERNE er det, der dømmes.) Nævner sektion 1 andre arter end de
--   syv, eller har sektion 3 en række: STOP — så er noget ændret et andet sted.
-- EFTER-SQL: samme (står nederst). FACIT EFTER: sektion 1 nævner alle OTTE,
--   'ti_minutter' sidst; sektion 2 uændret (migrationen rører ingen rækker i
--   webinar_mails); sektion 3 = webinar_ti_minutter_klar · true.
--
-- ROLLBACK (kun muligt, hvis ingen række har art = 'ti_minutter'; porten FØRST,
-- så cronen holder op med at tage arten med, før CHECK'en strammes):
--   begin;
--   delete from public.app_config where config_key = 'webinar_ti_minutter_klar';
--   alter table public.webinar_mails
--     drop constraint webinar_mails_art_check,
--     add constraint webinar_mails_art_check
--       check (art in ('bekraeftelse', 'fjorten_dage', 'syv_dage', 'tre_dage', 'en_dag', 'dagen', 'en_time'));
--   commit;

begin;

alter table public.webinar_mails
  drop constraint if exists webinar_mails_art_check,
  add constraint webinar_mails_art_check
    check (art in ('bekraeftelse', 'fjorten_dage', 'syv_dage', 'tre_dage', 'en_dag', 'dagen', 'en_time', 'ti_minutter'));

comment on column public.webinar_mails.art is
  'bekraeftelse · fjorten_dage · syv_dage · tre_dage · en_dag · dagen · en_time · ti_minutter (_shared/webinarMailDom.ts — ARTER). tre_dage og dagen er udgået (30/9), står for historikken. ti_minutter (3/10-2026) KUN for webinarmotorens tilmeldinger (P-<uuid>).';

insert into public.app_config (config_key, config_value, description)
values ('webinar_ti_minutter_klar', 'true'::jsonb, 'Porten for mailarten ti_minutter (3/10-2026): lagt af migration 20261003040000 sammen med webinar_mails_art_check. webinar-mail-cron læser den fail-closed før dommen; uden true er arten ikke med i kørslen. Slet den (rollback-rækkefølgen i migrationen) for at slukke arten.')
on conflict (config_key) do nothing;

commit;

-- EFTER-tjek (kør og gem CSV):
select '1 check' as sektion, conname as noegle, pg_get_constraintdef(oid) as vaerdi
  from pg_constraint
 where conname = 'webinar_mails_art_check'
union all
select '2 arter i brug', art, count(*)::text from public.webinar_mails group by art
union all
select '3 porten', config_key, config_value::text from public.app_config
 where config_key = 'webinar_ti_minutter_klar'
 order by 1, 2;
