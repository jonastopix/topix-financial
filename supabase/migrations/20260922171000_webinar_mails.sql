-- KØRT i prod — 22/9-2026 kl. 18:49 (Jonas, Lovable SQL editor), FØR udrulningen. EFTER: tabellerne webinar_mails og webinar_afmeldinger, 4 politikker, den unikke regel webinar_mails_en_pr_person_uidx, og låsen skrevet «ikke sat → false».
-- EFTER 20260922170000_webinar_tilmeldinger_links.sql og FØR functionerne udrulles.
--
-- PLATFORMENS FØR-WEBINAR-MAILS (Jonas 22/9-2026): platformen sender selv de
-- fem mails før en session; Klaviyo beholder efter-webinaret, og eWebinars
-- danske bekræftelse (med sin rigtige invite.ics) bliver.
--
-- TO TABELLER:
--   webinar_mails       sporet — én række pr. FORSØG, som klaviyo_haendelser
--   webinar_afmeldinger den, der har sagt fra — én række pr. mail
--
-- «ÉN MAIL PR. (PERSON, SESSION, ART)» BOR I DATABASEN, ikke i koden.
-- Et delvist unikt indeks på (email, session_tid, art) WHERE udfald = 'ok'
-- er dommeren — samme form som klaviyo_afmeldinger (22/9) og af samme grund:
-- to samtidige cron-kørsler må ikke kunne sende den samme mail to gange, og en
-- person med TRE registreringer til samme session er stadig én person.
-- Et FEJLET forsøg må derimod gerne stå flere gange — det er et spor.
--
-- LÅSEN: app_config['webinar_mail_aktiv'] (standard FALSE, sættes ikke her).
-- Uden den sender cronen intet, uanset dry_run — samme form som
-- meta_send_aktiv og ga_send_aktiv. Slås til med:
--   insert into public.app_config (config_key, config_value, description)
--   values ('webinar_mail_aktiv', 'true'::jsonb, 'Platformens før-webinar-mails sendes rigtigt')
--   on conflict (config_key) do update set config_value = excluded.config_value;
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables
--    where table_schema = 'public' and table_name in ('webinar_mails', 'webinar_afmeldinger')
--   union all
--   select '2 politikker', policyname, concat(tablename, ' | ', cmd) from pg_policies
--    where schemaname = 'public' and tablename in ('webinar_mails', 'webinar_afmeldinger')
--   union all
--   select '3 laasen', 'webinar_mail_aktiv', coalesce((select config_value::text from public.app_config where config_key = 'webinar_mail_aktiv'), 'ikke sat → false')
--   order by 1, 2;
--   FACIT FØR: sektion 1 og 2 TOMME; sektion 3 «ikke sat → false».
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = 2 rækker; sektion 2 = 4 politikker;
--   sektion 3 stadig «ikke sat → false» (låsen slås til separat, efter prøven).
--
-- ROLLBACK:
--   drop table if exists public.webinar_mails;
--   drop table if exists public.webinar_afmeldinger;

-- ── 1. Sporet ─────────────────────────────────────────────────────────────
create table if not exists public.webinar_mails (
  id            uuid primary key default gen_random_uuid(),
  forsoegt_at   timestamptz not null default now(),
  -- Personen. Altid små bogstaver, som resten af huset.
  email         text not null check (email = lower(email)),
  -- Sessionen, mailen handler om. NOT NULL: en mail uden en session findes ikke.
  session_tid   timestamptz not null,
  -- bekraeftelse · syv_dage · tre_dage · en_dag · dagen · en_time
  -- (_shared/webinarMailDom.ts — ARTER, i den rækkefølge de sendes).
  art           text not null,
  -- ok · ingen_noegle · noegle_afvist · loft · ugyldig · fejl · timeout
  -- — ordret klaviyo.ts' udfald, så sporene kan læses ens.
  udfald        text not null,
  status        integer,
  varighed_ms   integer,
  -- Mailguns eget id (Message-Id), når den tog imod.
  mailgun_id    text,
  -- Emnelinjen, som den gik — så en ændring i teksten kan ses bagud.
  emne          text,
  -- Mailguns svar, afkortet. Ved fejl står grunden her.
  svar          text,
  grund         text,
  -- Hvilken tilmelding mailen blev bygget af (til fejlsøgning; ikke en nøgle).
  ewebinar_id   text,
  -- KUN på bekræftelsen: gik den vedhæftede kalenderinvitation med?
  --   hentet      eWebinars .ics blev hentet og vedhæftet (METHOD:REQUEST)
  --   intet_link  tilmeldingen havde ingen kalender_link
  --   ikke_ics    svaret var ikke en iCalendar-fil (en fejlside med status 200)
  --   for_stor · fejl · timeout
  -- NULL på de fem påmindelser — de bærer ingen vedhæftning.
  -- Hentningen er FAIL-SOFT: mailen gik alligevel, og grunden står her.
  invitation    text,
  constraint webinar_mails_art_check check (art in ('bekraeftelse', 'syv_dage', 'tre_dage', 'en_dag', 'dagen', 'en_time')),
  constraint webinar_mails_udfald_check check (udfald in ('ok', 'ingen_noegle', 'noegle_afvist', 'loft', 'ugyldig', 'fejl', 'timeout')),
  constraint webinar_mails_invitation_check check (invitation is null or invitation in ('hentet', 'intet_link', 'ikke_ics', 'for_stor', 'fejl', 'timeout')),
  -- En invitation kan KUN stå på bekræftelsen; de fem påmindelser bærer ingen.
  constraint webinar_mails_invitation_kun_bekraeftelse check (invitation is null or art = 'bekraeftelse')
);

-- DOMMEREN. Uden dette indeks kunne to samtidige kørsler sende den samme mail
-- to gange — koden ville se «ingen række endnu» i begge.
create unique index if not exists webinar_mails_en_pr_person_uidx
  on public.webinar_mails (email, session_tid, art)
  where udfald = 'ok';

create index if not exists webinar_mails_session_idx on public.webinar_mails (session_tid, art);
create index if not exists webinar_mails_udfald_idx  on public.webinar_mails (udfald, forsoegt_at desc) where udfald <> 'ok';

comment on table public.webinar_mails is
  'Spor efter hver før-webinar-mail platformen har forsøgt at sende (22/9-2026). Én række pr. FORSØG — også de fejlede. «Én mail pr. (person, session, art)» håndhæves af det delvist unikke indeks WHERE udfald = ''ok'', ikke af koden. Kun webinar-mail-cron (service role) skriver; rådgivere læser.';

-- ── 2. Afmeldingen ────────────────────────────────────────────────────────
create table if not exists public.webinar_afmeldinger (
  email       text primary key check (email = lower(email)),
  afmeldt_at  timestamptz not null default now(),
  -- mail · raadgiver — hvor afmeldingen kom fra.
  kilde       text not null default 'mail',
  -- Hvilken session mailen handlede om, da de trykkede (til forståelse, ikke en nøgle).
  session_tid timestamptz,
  ip          text,
  user_agent  text,
  constraint webinar_afmeldinger_kilde_check check (kilde in ('mail', 'raadgiver'))
);

comment on table public.webinar_afmeldinger is
  'Adresser, der har sagt fra over for PLATFORMENS webinarmails (22/9-2026). Sat af webinar-afmeld (token i linket, ingen login). Denne tabel stopper husets egne før-webinar-mails, men ét klik er ét fravalg: samme kald afmelder OGSÅ profilen fra Klaviyos globale e-mailmarkedsføring og skriver en række i klaviyo_afmeldinger med kilde webinar_mail (besluttet af Jonas 22/9-2026). eWebinar røres IKKE — den har sin egen afmelding.';

-- ── 3. RLS: rådgivere læser, service role gør alt, ingen klient skriver ───
alter table public.webinar_mails       enable row level security;
alter table public.webinar_afmeldinger enable row level security;

drop policy if exists "Advisors can view webinar mails" on public.webinar_mails;
create policy "Advisors can view webinar mails"
  on public.webinar_mails for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage webinar mails" on public.webinar_mails;
create policy "Service role can manage webinar mails"
  on public.webinar_mails for all to service_role
  using (true) with check (true);

drop policy if exists "Advisors can view webinar afmeldinger" on public.webinar_afmeldinger;
create policy "Advisors can view webinar afmeldinger"
  on public.webinar_afmeldinger for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage webinar afmeldinger" on public.webinar_afmeldinger;
create policy "Service role can manage webinar afmeldinger"
  on public.webinar_afmeldinger for all to service_role
  using (true) with check (true);

-- EFTER-tjek (kør og gem CSV):
select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
  from information_schema.tables
 where table_schema = 'public' and table_name in ('webinar_mails', 'webinar_afmeldinger')
union all
select '2 politikker', policyname, concat(tablename, ' | ', cmd) from pg_policies
 where schemaname = 'public' and tablename in ('webinar_mails', 'webinar_afmeldinger')
union all
select '3 indeks', indexname, 'findes' from pg_indexes
 where schemaname = 'public' and indexname = 'webinar_mails_en_pr_person_uidx'
union all
select '4 laasen', 'webinar_mail_aktiv',
       coalesce((select config_value::text from public.app_config where config_key = 'webinar_mail_aktiv'), 'ikke sat → false')
 order by 1, 2;
