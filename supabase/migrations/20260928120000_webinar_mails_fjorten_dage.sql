-- KØRT i prod — 28/9-2026 kl. 10:00 (Jonas, Lovable SQL editor), FØR udrulningen af webinar-mail-cron. EFTER: art_check nævner syv arter; invitation_arter_check findes. Prøven til jonas@topix.dk 10:05 ok/200/hentet (rækken slettet 10:06).
-- OG FØR webinar-mail-cron UDRULLES. Rækkefølgen er ikke pynt: udrulles functionen
-- først, sender den «fjorten_dage»-mailen, CHECK'en afviser rækken i sporet
-- (23514, ikke 23505 — tælles som fejl, ikke dublet), og næste kørsel fem
-- minutter senere ser «ingen række» og sender den IGEN. Til ~317 mennesker,
-- hvert femte minut, i to timer.
--
-- NY MAILART «fjorten_dage» (Jonas 28/9-2026): «om to uger»-påmindelsen MED
-- eWebinars invite.ics vedhæftet — som bekræftelsen. Grunden: de ~217, der
-- tilmeldte sig 13/10 FØR 22/9 kl. 19:03, har ALDRIG fået en kalenderinvitation
-- (eWebinars bekræftelse var slukket til 15:50, Klaviyos lovede en, der ikke
-- fandtes), og bekræftelsen går aldrig bagud (BEKRAEFTELSE_FRA). Denne mail
-- lukker hullet og er påmindelsen — til ALLE tilmeldte til en kommende session.
--
-- TO CHECK'S RØRES, ingen rækker:
--   webinar_mails_art_check                  får 'fjorten_dage' (7 arter — ordret
--                                            _shared/webinarMailDom.ts' ARTER)
--   webinar_mails_invitation_kun_bekraeftelse ERSTATTES af
--   webinar_mails_invitation_arter_check     (invitation kun på bekraeftelse OG
--                                            fjorten_dage — ordret MED_INVITATION)
-- Kildeværnet webinarMail.guard dom 10 sammenligner begge lister med koden.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 check' as sektion, conname as noegle, pg_get_constraintdef(oid) as vaerdi
--     from pg_constraint
--    where conrelid = 'public.webinar_mails'::regclass
--      and (conname like 'webinar_mails_%check%' or conname like 'webinar_mails_invitation%')
--   union all
--   select '2 arter i brug', art, count(*)::text from public.webinar_mails group by art
--   order by 1, 2;
--   FACIT FØR: sektion 1 har webinar_mails_art_check med SEKS arter og
--   webinar_mails_invitation_kun_bekraeftelse; sektion 2 uden 'fjorten_dage'.
-- EFTER-SQL: samme. FACIT EFTER: art_check nævner alle SYV;
--   webinar_mails_invitation_arter_check findes, kun_bekraeftelse er væk;
--   sektion 2 uændret (migrationen rører ingen rækker).
--
-- ROLLBACK (kun muligt, hvis ingen række har art = 'fjorten_dage'):
--   alter table public.webinar_mails drop constraint webinar_mails_art_check;
--   alter table public.webinar_mails add constraint webinar_mails_art_check
--     check (art in ('bekraeftelse', 'syv_dage', 'tre_dage', 'en_dag', 'dagen', 'en_time'));
--   alter table public.webinar_mails drop constraint webinar_mails_invitation_arter_check;
--   alter table public.webinar_mails add constraint webinar_mails_invitation_kun_bekraeftelse
--     check (invitation is null or art = 'bekraeftelse');

alter table public.webinar_mails
  drop constraint if exists webinar_mails_art_check;

alter table public.webinar_mails
  add constraint webinar_mails_art_check
  check (art in ('bekraeftelse', 'fjorten_dage', 'syv_dage', 'tre_dage', 'en_dag', 'dagen', 'en_time'));

alter table public.webinar_mails
  drop constraint if exists webinar_mails_invitation_kun_bekraeftelse;

alter table public.webinar_mails
  drop constraint if exists webinar_mails_invitation_arter_check;

-- En invitation kan KUN stå på de arter, der bærer én (MED_INVITATION i dommen).
alter table public.webinar_mails
  add constraint webinar_mails_invitation_arter_check
  check (invitation is null or art in ('bekraeftelse', 'fjorten_dage'));

comment on column public.webinar_mails.art is
  'bekraeftelse · fjorten_dage · syv_dage · tre_dage · en_dag · dagen · en_time (_shared/webinarMailDom.ts — ARTER, i den rækkefølge de sendes). fjorten_dage (28/9-2026) bærer invite.ics som bekræftelsen og går til alle tilmeldte.';

comment on column public.webinar_mails.invitation is
  'KUN på bekraeftelse og fjorten_dage (MED_INVITATION): hentet · intet_link · ikke_ics · for_stor · fejl · timeout. NULL på de fem andre påmindelser. Hentningen er fail-soft: mailen gik alligevel, og grunden står her.';

-- EFTER-tjek (kør og gem CSV):
select '1 check' as sektion, conname as noegle, pg_get_constraintdef(oid) as vaerdi
  from pg_constraint
 where conrelid = 'public.webinar_mails'::regclass
   and (conname like 'webinar_mails_%check%' or conname like 'webinar_mails_invitation%')
union all
select '2 arter i brug', art, count(*)::text from public.webinar_mails group by art
 order by 1, 2;
