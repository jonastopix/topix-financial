-- KØRT i prod — 22/9-2026 kl. 18:48 (Jonas, Lovable SQL editor), FØR udrulningen af webinar-mail-cron. EFTER: de tre kolonner står, og bagud-fyldningen fra `raa` ramte ALLE 691 rækker — alle tre felter fyldt på alle. De 216 til 13/10 har join_link og kalender_link, 0 uden. Uden fyldningen ville en påmindelse til en gammel tilmelding stå uden knap.
-- og FØR ewebinar-webhook og webinar-mail-cron udrulles.
--
-- DE TRE LINKS, EWEBINAR HAR SENDT HELE TIDEN (22/9-2026).
-- Webhookens payload bærer dem pr. registrant (ewebinar.com/help/webhook):
--   joinLink           «Session entry URL»      — PERSONLIGT pr. registrant
--   addToCalendarLink  «Calendar ICS file URL»  — https://api.ewebinar.com/v1/attendees/<id>/ics
--   replayLink         «Replay access URL»
-- De har ligget i `webinar_tilmeldinger.raa` siden 19/9 uden at blive plukket
-- ud (webinarDom.plukTilmelding). Platformen skal nu selv sende før-webinar-
-- mailene, og uden det PERSONLIGE join-link er en påmindelse kun en besked om,
-- at noget sker.
--
-- MÅLT 22/9: addToCalendarLink svarer HTTP 200 offentligt og bærer
-- METHOD:REQUEST — altså en rigtig kalenderinvitation, ikke en «føj til
-- kalender»-fil. Derfor er det DEN, mailene linker til for Apple og
-- Outlook-desktop; Google og Outlook-web får deres egne deeplinks, bygget af
-- session_tid (webinarMailDom.ts).
--
-- BAGUD FYLDES HER, I MIGRATIONEN — ikke med importen.
--
-- Linkene har ligget i `raa` hele tiden; de mangler kun i kolonnerne. En UPDATE
-- af `raa->>'joinLink'` og de to andre er derfor ikke en hentning, men en
-- flytning af noget, vi allerede har. MÅLT 22/9: alle 50 målte rækker til
-- sessionen 13/10 bærer alle tre nøgler i `raa`.
--
-- HVORFOR IKKE `ewebinar-import`. Reglen fra 21/9 (#1062, OVERLEVERING
-- «21. september» §9) er ubetinget: importen køres ALDRIG med dry_run: false
-- uden send_fremmoede: true — og send_fremmoede ville sende «Mødte ikke op»
-- til mennesker. Der er ingen tilstand af importen, der kun fylder tre
-- kolonner. Migrationen gør præcis det, og intet andet.
--
-- UPDATE'EN ER IDEMPOTENT OG SMAL: kun rækker hvor kolonnen ER null OG `raa`
-- HAR nøglen. En række, webhooken allerede har fyldt, røres ikke; en række uden
-- nøglen får ikke en tom streng. Et `coalesce` ville have skrevet den gamle
-- værdi tilbage på ALLE rækker — derfor betingelsen.
--
-- FREMOVER passer webhooken sig selv: eWebinar POSTer ved hver ændring, og
-- plukTilmelding skriver de tre felter.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonner' as sektion, column_name as noegle, data_type as vaerdi
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'webinar_tilmeldinger'
--      and column_name in ('join_link', 'kalender_link', 'replay_link')
--   union all
--   select '2 raekker', 'i alt', count(*)::text from public.webinar_tilmeldinger
--   union all
--   select '3 i raa', 'med joinLink', count(*) filter (where raa ? 'joinLink')::text
--     from public.webinar_tilmeldinger
--   union all
--   select '3 i raa', 'med addToCalendarLink', count(*) filter (where raa ? 'addToCalendarLink')::text
--     from public.webinar_tilmeldinger
--   union all
--   select '4 fremtid', 'rækker med session efter nu', count(*)::text
--     from public.webinar_tilmeldinger where session_tid > now()
--   order by 1, 2;
--   FACIT FØR: sektion 1 TOM. Sektion 3 > 0 (linkene ligger i raa) — målt 22/9:
--   alle 50 målte rækker til 13/10 bærer alle tre nøgler.
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = 3 rækker, alle `text`.
-- Og udefra, før udrulningen:
--   GET /rest/v1/webinar_tilmeldinger?select=join_link&limit=0  → 200
--
-- ROLLBACK (fjerner både kolonnerne og det, UPDATE'en fyldte i dem):
--   alter table public.webinar_tilmeldinger
--     drop column if exists join_link,
--     drop column if exists kalender_link,
--     drop column if exists replay_link;

alter table public.webinar_tilmeldinger
  add column if not exists join_link     text,
  add column if not exists kalender_link text,
  add column if not exists replay_link   text;

comment on column public.webinar_tilmeldinger.join_link is
  'eWebinars joinLink — PERSONLIGT link til sessionen for netop denne registrant. Går kun i mails til personen selv; webinar-delt afviser det (findForbudteNoegler).';
comment on column public.webinar_tilmeldinger.kalender_link is
  'eWebinars addToCalendarLink — https://api.ewebinar.com/v1/attendees/<id>/ics, METHOD:REQUEST (målt 22/9, HTTP 200 offentligt). Bruges som «Apple/Outlook»-linket i før-webinar-mailene.';
comment on column public.webinar_tilmeldinger.replay_link is
  'eWebinars replayLink — personligt link til optagelsen.';

-- ── BAGUD: flyt det, der allerede ligger i raa, ned i kolonnerne ──────────
-- Smal og idempotent: kun NULL-kolonner, og kun hvor nøglen findes i raa.
-- Kører den to gange, rammer anden kørsel nul rækker.
update public.webinar_tilmeldinger
   set join_link = raa ->> 'joinLink'
 where join_link is null and raa ? 'joinLink' and nullif(raa ->> 'joinLink', '') is not null;

update public.webinar_tilmeldinger
   set kalender_link = raa ->> 'addToCalendarLink'
 where kalender_link is null and raa ? 'addToCalendarLink' and nullif(raa ->> 'addToCalendarLink', '') is not null;

update public.webinar_tilmeldinger
   set replay_link = raa ->> 'replayLink'
 where replay_link is null and raa ? 'replayLink' and nullif(raa ->> 'replayLink', '') is not null;

-- EFTER-tjek (kør og gem CSV — ét resultatsæt, som Lovable eksporterer):
select '1 kolonner' as sektion, column_name as noegle, data_type as vaerdi
  from information_schema.columns
 where table_schema = 'public' and table_name = 'webinar_tilmeldinger'
   and column_name in ('join_link', 'kalender_link', 'replay_link')
union all
select '2 fyldt i alt', 'rækker i alt', count(*)::text from public.webinar_tilmeldinger
union all
select '2 fyldt i alt', 'med join_link', count(*) filter (where join_link is not null)::text
  from public.webinar_tilmeldinger
union all
select '2 fyldt i alt', 'med kalender_link', count(*) filter (where kalender_link is not null)::text
  from public.webinar_tilmeldinger
union all
select '2 fyldt i alt', 'med replay_link', count(*) filter (where replay_link is not null)::text
  from public.webinar_tilmeldinger
union all
-- DET, DER BETYDER NOGET: de kommende sessioner. Det er dem, mailene går til.
select '3 fremtidige sessioner', 'rækker med session efter nu', count(*)::text
  from public.webinar_tilmeldinger where session_tid > now()
union all
select '3 fremtidige sessioner', 'heraf med join_link', count(*)::text
  from public.webinar_tilmeldinger where session_tid > now() and join_link is not null
union all
select '3 fremtidige sessioner', 'heraf med kalender_link (invitationen)', count(*)::text
  from public.webinar_tilmeldinger where session_tid > now() and kalender_link is not null
union all
select '3 fremtidige sessioner', 'heraf UDEN kalender_link — bekraeftelse uden invitation', count(*)::text
  from public.webinar_tilmeldinger where session_tid > now() and kalender_link is null
union all
select '4 pr. session', to_char(session_tid at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI'),
       concat(count(*), ' tilmeldinger · ', count(*) filter (where join_link is not null), ' med join_link · ',
              count(*) filter (where kalender_link is not null), ' med kalender_link')
  from public.webinar_tilmeldinger where session_tid > now() group by session_tid
 order by 1, 2;
--   FACIT EFTER: sektion 1 = 3 rækker. I sektion 3 skal «heraf med
--   kalender_link» være lig med «rækker med session efter nu» — målt 22/9 bærer
--   alle 50 målte rækker til 13/10 nøglen i raa, så «UDEN» bør være 0. Er den
--   det ikke, får netop de personer en bekræftelse UDEN invitation (fail-soft),
--   og grunden står bagefter i webinar_mails.invitation = 'intet_link'.
