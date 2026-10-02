-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- OG FØR webinar-mail-cron UDRULLES. Rækkefølgen er ikke pynt: udrulles functionen
-- først, sender den «ti_minutter»-mailen, CHECK'en afviser rækken i sporet (23514,
-- ikke 23505 — tælles som fejl, ikke dublet), og næste kørsel ser «ingen ok-række»
-- og sender den IGEN, så længe vinduet (T−15 … T−5 min) er åbent. Samme fælde som
-- fjorten_dage (20260928120000).
--
-- NY MAILART «ti_minutter» (3/10-2026, docs/webinarmotor.md §4 og §8.4 punkt 3):
-- «Vi begynder om 10 minutter» — KUN for webinarmotorens tilmeldinger
-- (ewebinar_id «P-<uuid>», kilde_system 'platform'). eWebinar sender selv sin
-- 10-minutters-mail til sine tilmeldte; dommen (_shared/webinarMailDom.ts,
-- Plan.kunMotor) giver ALDRIG en eWebinar-række arten.
--
-- ÉN CHECK RØRES, ingen rækker:
--   webinar_mails_art_check  får 'ti_minutter' (8 arter — ordret
--                            _shared/webinarMailDom.ts' ARTER, i samme rækkefølge)
-- webinar_mails_invitation_arter_check er URØRT: ti_minutter bærer ingen
-- kalenderfil (står ikke i MED_INVITATION), så invitation er altid NULL på den.
-- Kildeværnet webinarMail.guard dom 10 sammenligner listen med koden.
--
-- RÆKKEFØLGEN: merge → DENNE migration (FØR/EFTER nedenfor) → eksplicit deploy af
-- webinar-mail-cron fra build-chatten → beviset: en tørkørsel svarer med feltet
-- `ti_minutter` ({ ikke_motor, skal_sendes }) — kun den nye kode har det; med
-- eWebinars 13/10-hold i vinduet er ikke_motor > 0 og skal_sendes 0.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 check' as sektion, conname as noegle, pg_get_constraintdef(oid) as vaerdi
--     from pg_constraint
--    where conname = 'webinar_mails_art_check'
--   union all
--   select '2 arter i brug', art, count(*)::text from public.webinar_mails group by art
--   order by 1, 2;
--   FACIT FØR: sektion 1 = CHECK ((art = ANY (ARRAY['bekraeftelse'::text,
--   'fjorten_dage'::text, 'syv_dage'::text, 'tre_dage'::text, 'en_dag'::text,
--   'dagen'::text, 'en_time'::text]))) — SYV arter; sektion 2 uden 'ti_minutter'.
--   (Postgres' gengivelse af en IN-liste; formen er ikke målt — ARTERNE er det,
--   der dømmes.) Nævner sektion 1 andre arter end de syv: STOP — så er CHECK'en
--   ændret et andet sted.
-- EFTER-SQL: samme (står nederst). FACIT EFTER: sektion 1 nævner alle OTTE,
--   'ti_minutter' sidst; sektion 2 uændret (migrationen rører ingen rækker).
--
-- ROLLBACK (kun muligt, hvis ingen række har art = 'ti_minutter'):
--   alter table public.webinar_mails drop constraint webinar_mails_art_check;
--   alter table public.webinar_mails add constraint webinar_mails_art_check
--     check (art in ('bekraeftelse', 'fjorten_dage', 'syv_dage', 'tre_dage', 'en_dag', 'dagen', 'en_time'));

alter table public.webinar_mails
  drop constraint if exists webinar_mails_art_check;

alter table public.webinar_mails
  add constraint webinar_mails_art_check
  check (art in ('bekraeftelse', 'fjorten_dage', 'syv_dage', 'tre_dage', 'en_dag', 'dagen', 'en_time', 'ti_minutter'));

comment on column public.webinar_mails.art is
  'bekraeftelse · fjorten_dage · syv_dage · tre_dage · en_dag · dagen · en_time · ti_minutter (_shared/webinarMailDom.ts — ARTER). tre_dage og dagen er udgået (30/9), står for historikken. ti_minutter (3/10-2026) KUN for webinarmotorens tilmeldinger (P-<uuid>).';

-- EFTER-tjek (kør og gem CSV):
select '1 check' as sektion, conname as noegle, pg_get_constraintdef(oid) as vaerdi
  from pg_constraint
 where conname = 'webinar_mails_art_check'
union all
select '2 arter i brug', art, count(*)::text from public.webinar_mails group by art
 order by 1, 2;
