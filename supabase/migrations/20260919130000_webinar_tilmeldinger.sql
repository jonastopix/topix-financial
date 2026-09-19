-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge — FØR
-- ewebinar-webhook får trafik (functionen svarer 500 på hver besked indtil
-- tabellerne findes; eWebinar gensender formentlig, men bevis det ikke).
--
-- eWebinar-webhooken (udkast 19/9-2026, ~/Downloads/udkast-ewebinar-webhook/
-- README.md): tilmeldinger og deltagelse ind i platformen, så en ansøgning med
-- samme mail kan vise «så 62 % af webinaret 22/9» i stedet for ansøgerens
-- eget «ja», og så tallet «hvor mange har set webinaret / er tilmeldt det
-- næste» kan regnes.
--
-- TO TABELLER, én skriver (service role via ewebinar-webhook), rådgivere læser:
--   webinar_haendelser   LOGGEN — én række pr. modtaget besked med HELE den rå
--                        payload (raa jsonb). Idempotent på aftryk = SHA-256 af
--                        den rå body: gensender eWebinar samme besked, er det
--                        én række. Slettes aldrig; det er kilden vi plukker fra
--                        når vi lærer nye felter (procenten — se README §4).
--   webinar_tilmeldinger AKTUEL TILSTAND — én række pr. eWebinar-registrant-id.
--                        De plukkede felter + seneste rå payload. set_procent
--                        er den FAKTISKE procent når vi har den (Jonas 19/9:
--                        «vil gerne vide hvor meget de har set»); dommen
--                        «set / delvist / mødte ikke» UDLEDES af tallet i
--                        _shared/webinarDom.ts, aldrig gemt.
-- KOBLINGEN til ansøgningen er email alene: CHECK email = lower(email) her,
-- som ansoegninger_email_check — så et join på lige mails er rigtigt.
-- Ingen fremmednøgle til ansoegninger: en tilmelding findes før (og uden) en
-- ansøgning, og en ansøgning findes uden tilmelding.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables where table_schema = 'public' and table_name in ('webinar_haendelser', 'webinar_tilmeldinger')
--   union all
--   select '2 politikker', concat(tablename, ': ', policyname), concat(cmd, ' | ', roles::text) from pg_policies
--     where schemaname = 'public' and tablename in ('webinar_haendelser', 'webinar_tilmeldinger')
--   union all
--   select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 og 2 tomme.
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = 2 rækker; sektion 2 = 4 politikker
--   (advisor SELECT + service_role ALL på hver tabel); begge tabeller 0 rækker:
--   select 'haendelser', count(*) from public.webinar_haendelser union all select 'tilmeldinger', count(*) from public.webinar_tilmeldinger;
--
-- ROLLBACK (ingen data i prod før webhooken er tændt i eWebinar):
--   drop table if exists public.webinar_tilmeldinger;
--   drop table if exists public.webinar_haendelser;

-- ── 1. Loggen ────────────────────────────────────────────────────────────
create table if not exists public.webinar_haendelser (
  id              uuid primary key default gen_random_uuid(),
  modtaget_at     timestamptz not null default now(),
  -- SHA-256 (64 hex) over den RÅ body — idempotensnøglen ved gensendelse.
  aftryk          text not null unique check (aftryk ~ '^[0-9a-f]{64}$'),
  -- t= fra X-EWebinar-Signature (unix-sekunder) — eWebinars egen tid for beskeden.
  signatur_t      bigint,
  -- Hvilken nøgleform signaturen matchede (utf8 | hex) — måles på de første kald, README §5.
  noegleform      text check (noegleform is null or noegleform in ('utf8', 'hex')),
  -- Plukket til hurtig læsning; sandheden er raa.
  action          text,
  state           text,
  ewebinar_id     text,
  email           text check (email is null or email = lower(email)),
  webinar_id      text,
  -- Hvorfor plukket fejlede (uden_id | uden_email | uden_webinar_id | ikke_et_objekt); null = plukket.
  pluk_grund      text,
  raa             jsonb not null
);

create index if not exists webinar_haendelser_ewebinar_id_idx on public.webinar_haendelser (ewebinar_id);
create index if not exists webinar_haendelser_email_idx       on public.webinar_haendelser (email);
create index if not exists webinar_haendelser_modtaget_idx    on public.webinar_haendelser (modtaget_at desc);

comment on table public.webinar_haendelser is
  'eWebinar-webhookens log (udkast 19/9-2026): én række pr. modtaget, signatur-verificeret besked med HELE payloaden i raa. Idempotent på aftryk (SHA-256 af rå body). Kun ewebinar-webhook (service role) skriver; rådgivere læser. Slettes aldrig — det er kilden når nye felter skal plukkes.';

-- ── 2. Den aktuelle tilstand ─────────────────────────────────────────────
create table if not exists public.webinar_tilmeldinger (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- eWebinars registrant-id (payload.id / attendeeId): én række pr. tilmelding.
  ewebinar_id         text not null unique,
  email               text not null check (email = lower(email)),
  navn                text,
  webinar_id          text not null,
  webinar_titel       text,
  -- Sessionens starttid (ISO fra payload.sessionTime); null ved Replay/OnDemand.
  session_tid         timestamptz,
  session_type        text,
  registreret_at      timestamptz,
  -- eWebinars ord, gemt som de kom: Registered · NotJoined · Joined · Missed · Watched.
  state               text,
  -- Seneste action: Registered · Joined · Left · WatchedWebinar · WatchedReplay · MissedWebinar · WebinarFinished · Converted · Unsubscribed.
  sidste_action       text,
  attended            text,
  subscribed          text,
  -- DEN FAKTISKE PROCENT (0–100) når vi har den; går aldrig ned (fletTilmelding). Null = ikke målt.
  set_procent         numeric(5, 2) check (set_procent is null or (set_procent >= 0 and set_procent <= 100)),
  -- Hvilket felt i payloaden tallet kom fra — så vi ved hvad der ramte.
  set_procent_kilde   text,
  sidste_haendelse_at timestamptz,
  -- Seneste rå payload (loggen har dem alle).
  raa                 jsonb
);

create index if not exists webinar_tilmeldinger_email_idx       on public.webinar_tilmeldinger (email);
create index if not exists webinar_tilmeldinger_webinar_id_idx  on public.webinar_tilmeldinger (webinar_id);
create index if not exists webinar_tilmeldinger_session_tid_idx on public.webinar_tilmeldinger (session_tid);

drop trigger if exists webinar_tilmeldinger_updated_at on public.webinar_tilmeldinger;
create trigger webinar_tilmeldinger_updated_at
  before update on public.webinar_tilmeldinger
  for each row execute function public.update_updated_at_column();

comment on table public.webinar_tilmeldinger is
  'Aktuel tilstand pr. eWebinar-tilmelding (udkast 19/9-2026): plukkede felter + seneste rå payload. set_procent er den faktiske procent (aldrig udledt af en hændelse, går aldrig ned). Dommen set/delvist/mødte ikke regnes af _shared/webinarDom.ts (≥ 75 % = set). Kobles til ansoegninger på email (begge lower). Kun ewebinar-webhook (service role) skriver; rådgivere læser.';

-- ── 3. RLS: rådgivere læser, service role gør alt, ingen klient skriver ──
alter table public.webinar_haendelser   enable row level security;
alter table public.webinar_tilmeldinger enable row level security;

drop policy if exists "Advisors can view webinar haendelser" on public.webinar_haendelser;
create policy "Advisors can view webinar haendelser"
  on public.webinar_haendelser for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage webinar haendelser" on public.webinar_haendelser;
create policy "Service role can manage webinar haendelser"
  on public.webinar_haendelser for all to service_role
  using (true) with check (true);

drop policy if exists "Advisors can view webinar tilmeldinger" on public.webinar_tilmeldinger;
create policy "Advisors can view webinar tilmeldinger"
  on public.webinar_tilmeldinger for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage webinar tilmeldinger" on public.webinar_tilmeldinger;
create policy "Service role can manage webinar tilmeldinger"
  on public.webinar_tilmeldinger for all to service_role
  using (true) with check (true);

-- EFTER-tjek (samme som filhovedets EFTER-SQL — kør og gem CSV):
select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
  from information_schema.tables where table_schema = 'public' and table_name in ('webinar_haendelser', 'webinar_tilmeldinger')
union all
select '2 politikker', concat(tablename, ': ', policyname), concat(cmd, ' | ', roles::text) from pg_policies
  where schemaname = 'public' and tablename in ('webinar_haendelser', 'webinar_tilmeldinger')
union all
select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
order by 1, 2;
