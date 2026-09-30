-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- OG FØR webinar-tilmeld, webinar-rum og webinar-puls udrulles: alle tre læser
-- og skriver tabellerne og kolonnerne herunder og svarer 500 uden dem.
--
-- WEBINARMOTOREN, SKIVE 1 (30/9-2026) — husets egen lead-motor i stedet for
-- eWebinar. Spec'en: ~/topix-financial-webinarmotor-spec.md §C (data), §D
-- (arkitektur), §F skive 1. Dokumentet: docs/webinarmotor.md.
--
-- KUN TILFØJENDE. Ni nye tabeller, to nye SQL-funktioner (SECURITY INVOKER,
-- EXECUTE kun til service_role), én ny trigger på en NY tabel, og nye kolonner
-- på webinar_tilmeldinger og ansoegninger. Ingen eksisterende kolonne, CHECK,
-- politik, funktion eller trigger røres. Ingen række i en eksisterende tabel
-- ændres: de nye kolonner på webinar_tilmeldinger får deres standardværdi
-- (kilde_system = 'ewebinar', token_version = 1) — metadata, ingen omskrivning.
--
-- PARITET: motoren skriver de SAMME kolonner i webinar_tilmeldinger som
-- eWebinar-webhooken, med eWebinars ord (state, sidste_action, set_procent,
-- session_tid, session_type, utm_*/fbclid, registreret_at). ewebinar_id er
-- 'P-' || id for platformens rækker (beslutning G7), så Klaviyos unique_id og
-- alle læsere er uændrede. join_link/kalender_link står NULL for platformen —
-- de UDLEDES (HMAC-tokenet, _shared/webinarMotor/token.ts), aldrig gemt.
--
-- RLS-GRUNDREGEL (spec §C1): ingen anon-politik på nogen webinartabel; alt
-- offentligt går gennem functions med token. RÅ data (webinar_pulser,
-- webinar_motor_log) er service-role-only. Rådgivere LÆSER resten. Rådgivernes
-- skriveadgang til konfigurationen (webinarer, interaktioner, sessioner,
-- gentagelser) gives IKKE her — den kommer med webinar-admin (skive 6), når der
-- er en flade at bruge den fra. Intet bliver bredere end nødvendigt.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables where table_schema = 'public'
--      and table_name in ('webinarer','webinar_sessioner','webinar_gentagelser','webinar_interaktioner',
--                         'webinar_deltagelser','webinar_pulser','webinar_motor_log','webinar_svar',
--                         'webinar_reaktioner','webinar_spoergsmaal')
--   union all
--   select '2 nye kolonner', concat(table_name, '.', column_name), data_type from information_schema.columns
--    where table_schema = 'public'
--      and ((table_name = 'webinar_tilmeldinger' and column_name in ('kilde_system','session_id','token_version',
--            'samtykke_nyhedsbrev_at','fbp','fbc_cookie','ga_client_id','user_agent','fornavn','flyttet_fra_session_id','ip_dagshash'))
--        or (table_name = 'ansoegninger' and column_name = 'webinar_tilmelding_id'))
--   union all
--   select '3 funktioner', p.proname, pg_get_function_identity_arguments(p.oid) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('webinar_puls_skriv','webinar_reaktion_tael','webinar_interaktion_uforanderlig')
--   union all
--   select '4 raekker', 'webinar_tilmeldinger', count(*)::text from public.webinar_tilmeldinger
--   union all
--   select '5 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1, 2 og 3 er TOMME. Sektion 4 = antallet af eWebinar-rækker (notér tallet).
--
-- EFTER-SQL: selve filens sidste SELECT (ét resultatsæt). FACIT EFTER:
--   sektion 1 = 10 tabeller · sektion 2 = 12 kolonner · sektion 3 = 3 funktioner ·
--   sektion 4 «raekker» uændret, OG «kilde_system ewebinar» = det samme tal, «platform» = 0 ·
--   sektion 6 politikker: pulser og motor_log KUN service_role; de otte andre
--   service_role ALL + advisor SELECT · sektion 7: EXECUTE på de to skrive-
--   funktioner KUN for service_role (anon/authenticated = false).
-- Og udefra, FØR udrulning af functionerne (CLAUDE.md «Nye migrations»):
--   GET /rest/v1/webinar_tilmeldinger?select=kilde_system,session_id,token_version&limit=0  → 200
--   GET /rest/v1/webinar_deltagelser?select=set_procent&limit=0                             → 200 (RLS: tom liste)
--
-- ROLLBACK (ingen data før functionerne er udrullet og en formular peger på dem):
--   drop function if exists public.webinar_puls_skriv(uuid, uuid, text, integer, jsonb, integer[], integer[], integer[], integer[], integer, integer, numeric, boolean, integer, jsonb);
--   drop function if exists public.webinar_reaktion_tael(uuid, integer, text);
--   drop table if exists public.webinar_reaktioner, public.webinar_svar, public.webinar_spoergsmaal,
--     public.webinar_motor_log, public.webinar_pulser, public.webinar_deltagelser cascade;
--   alter table public.ansoegninger drop column if exists webinar_tilmelding_id;
--   drop index if exists public.webinar_tilmeldinger_platform_email_session_uidx;
--   alter table public.webinar_tilmeldinger drop column if exists kilde_system, drop column if exists session_id,
--     drop column if exists token_version, drop column if exists samtykke_nyhedsbrev_at, drop column if exists fbp,
--     drop column if exists fbc_cookie, drop column if exists ga_client_id, drop column if exists user_agent,
--     drop column if exists fornavn, drop column if exists flyttet_fra_session_id, drop column if exists ip_dagshash;
--   drop table if exists public.webinar_interaktioner, public.webinar_gentagelser, public.webinar_sessioner, public.webinarer cascade;
--   drop function if exists public.webinar_interaktion_uforanderlig();

-- ── 1. Webinaret (konfigurationen) ──────────────────────────────────────────
create table if not exists public.webinarer (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  titel             text not null check (length(titel) between 1 and 200),
  beskrivelse       text,
  vaert_navn        text,
  vaert_billede     text,
  -- Bunny-GUID'er i webinarbiblioteket (BUNNY_WEBINAR_LIBRARY_ID) — aldrig Akademiets.
  bunny_video_id    text check (bunny_video_id is null or bunny_video_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  intro_video_id    text check (intro_video_id is null or intro_video_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  -- FRA BUNNYS video-info, aldrig tastet: et tastet tal er en observation, et målt tal er en nøgle.
  varighed_sek      integer not null check (varighed_sek > 0),
  intro_sek         integer not null default 0 check (intro_sek >= 0),
  lobby_min         integer not null default 15 check (lobby_min between 0 and 60),
  exitrum_min       integer not null default 15 check (exitrum_min between 0 and 60),
  status            text not null default 'kladde' check (status in ('kladde', 'aktiv', 'arkiveret')),
  -- Den UDGIVNE tidslinje. Interaktioner med version ≤ denne er frosne (triggeren nedenfor).
  tidslinje_version integer not null default 0 check (tidslinje_version >= 0),
  oprettet_af       uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists webinarer_updated_at on public.webinarer;
create trigger webinarer_updated_at before update on public.webinarer
  for each row execute function public.update_updated_at_column();

comment on table public.webinarer is
  'Webinarmotoren (skive 1, 30/9-2026): ét webinar = én video + tidslinje. varighed_sek og intro_sek TASTES af rådgiveren på /webinar/motor (skive 3) — ikke læst fra Bunny; et tastet tal er en observation og skal være videoens præcise længde. Service role skriver; rådgivere læser (og skriver gennem RLS fra skive 3, migration 20260930160000).';

-- ── 2. Sessioner og gentagelser ─────────────────────────────────────────────
create table if not exists public.webinar_gentagelser (
  id          uuid primary key default gen_random_uuid(),
  webinar_id  uuid not null references public.webinarer(id) on delete cascade,
  -- { ugedag, interval_uger, tid, fra, til } — materialiseres af webinar-motor-cron (skive 2/6).
  regel       jsonb not null,
  aktiv       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.webinar_sessioner (
  id                 uuid primary key default gen_random_uuid(),
  webinar_id         uuid not null references public.webinarer(id) on delete cascade,
  starter_at         timestamptz not null,
  -- eWebinars ord, så session_type på tilmeldingen passer til de eksisterende læsere.
  type               text not null default 'Scheduled' check (type in ('Scheduled', 'JustInTime', 'OnDemand')),
  kapacitet          integer check (kapacitet is null or kapacitet > 0),
  status             text not null default 'planlagt' check (status in ('planlagt', 'aaben', 'afholdt', 'aflyst')),
  -- Tidslinjen FRYSES ved lobby-åbning: en redigering midt i en session ændrer ikke, hvad seerne ser.
  tidslinje_version  integer,
  tidslinje_snapshot jsonb,
  ics_sekvens        integer not null default 0 check (ics_sekvens >= 0),
  gentagelse_id      uuid references public.webinar_gentagelser(id) on delete set null,
  afsluttet_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (webinar_id, starter_at)
);

create index if not exists webinar_sessioner_status_starter_idx on public.webinar_sessioner (status, starter_at);

-- ── 3. Interaktionerne på tidskoder ─────────────────────────────────────────
create table if not exists public.webinar_interaktioner (
  id             uuid primary key default gen_random_uuid(),
  webinar_id     uuid not null references public.webinarer(id) on delete cascade,
  version        integer not null check (version >= 1),
  art            text not null check (art in ('cta', 'feedback', 'poll', 'quiz', 'spoergsmaal_prompt', 'reaktion', 'haand', 'ressource', 'kapitel')),
  vis_fra_sek    integer not null check (vis_fra_sek >= 0),
  vis_til_sek    integer check (vis_til_sek is null or vis_til_sek > vis_fra_sek),
  placering      text not null check (placering in ('overlay', 'sidepanel', 'exitrum')),
  -- Valideret af webinarMotor/interaktioner.ts:interaktionSkema (delt med serveren).
  indhold        jsonb not null,
  -- KUN to regler: { efter_svar: {interaktion_id, valg} } eller { min_set_procent: N }. Ukendt = vises ikke.
  betingelse     jsonb,
  -- En nedtælling kræver en kilde, VI ejer (spec §A6.1). null = ingen nedtælling.
  udloeber_kilde text check (udloeber_kilde is null or udloeber_kilde in ('session_slut', 'optag_frist', 'naeste_session')),
  created_at     timestamptz not null default now()
);

create index if not exists webinar_interaktioner_webinar_version_idx on public.webinar_interaktioner (webinar_id, version);

-- En UDGIVET version ændres aldrig: svarene peger på den. BEFORE UPDATE-trigger
-- på en NY tabel — ikke en af de forbudte (protect_*_immutable_fields).
-- SECURITY INVOKER (standard): den læser kun webinarer, som service role ser.
create or replace function public.webinar_interaktion_uforanderlig()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_udgivet integer;
begin
  select tidslinje_version into v_udgivet from public.webinarer where id = old.webinar_id;
  if v_udgivet is not null and old.version <= v_udgivet then
    raise exception 'webinar_interaktioner: version % er udgivet og kan ikke ændres — lav en ny version', old.version
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists webinar_interaktioner_uforanderlig on public.webinar_interaktioner;
create trigger webinar_interaktioner_uforanderlig before update on public.webinar_interaktioner
  for each row execute function public.webinar_interaktion_uforanderlig();

-- ── 4. Tilmeldingen: KUN nye kolonner ───────────────────────────────────────
alter table public.webinar_tilmeldinger
  add column if not exists kilde_system           text not null default 'ewebinar',
  add column if not exists session_id             uuid references public.webinar_sessioner(id) on delete set null,
  add column if not exists token_version          integer not null default 1,
  add column if not exists samtykke_nyhedsbrev_at timestamptz,
  add column if not exists fbp                    text,
  add column if not exists fbc_cookie             text,
  add column if not exists ga_client_id           text,
  add column if not exists user_agent             text,
  add column if not exists fornavn                text,
  add column if not exists flyttet_fra_session_id uuid,
  -- sha256(ip + ":" + dato) — skifter dagligt, bruges KUN til loftet. Aldrig rå IP.
  add column if not exists ip_dagshash            text;

-- CHECK'ene står for sig (navngivne), så de kan læses i pg_constraint.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'webinar_tilmeldinger_kilde_system_check') then
    alter table public.webinar_tilmeldinger
      add constraint webinar_tilmeldinger_kilde_system_check check (kilde_system in ('ewebinar', 'platform'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'webinar_tilmeldinger_token_version_check') then
    alter table public.webinar_tilmeldinger
      add constraint webinar_tilmeldinger_token_version_check check (token_version >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'webinar_tilmeldinger_ip_dagshash_check') then
    alter table public.webinar_tilmeldinger
      add constraint webinar_tilmeldinger_ip_dagshash_check check (ip_dagshash is null or ip_dagshash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

-- «Én tilmelding pr. (mail, session)» er DATABASENS dom for platformens rækker
-- (email har allerede CHECK email = lower(email)). eWebinars rækker røres ikke.
create unique index if not exists webinar_tilmeldinger_platform_email_session_uidx
  on public.webinar_tilmeldinger (email, session_id) where kilde_system = 'platform';
create index if not exists webinar_tilmeldinger_session_id_idx
  on public.webinar_tilmeldinger (session_id) where session_id is not null;
create index if not exists webinar_tilmeldinger_ip_dagshash_idx
  on public.webinar_tilmeldinger (ip_dagshash, created_at) where ip_dagshash is not null;

comment on column public.webinar_tilmeldinger.kilde_system is
  'Webinarmotoren (30/9-2026): ewebinar = eWebinar-webhook/import; platform = webinar-tilmeld. For platformens rækker er ewebinar_id = ''P-'' || id (beslutning G7 — navnet lyver i parallelperioden og omdøbes efter opsigelsen).';
comment on column public.webinar_tilmeldinger.token_version is
  'Deltagertokenets version (HMAC, _shared/webinarMotor/token.ts). Tokenet gemmes ALDRIG; += 1 tilbagekalder alle links til tilmeldingen.';

-- ── 5. Ansøgningen kan pege på tilmeldingen (skive 4 skriver den) ───────────
alter table public.ansoegninger
  add column if not exists webinar_tilmelding_id uuid references public.webinar_tilmeldinger(id) on delete set null;
create index if not exists ansoegninger_webinar_tilmelding_idx
  on public.ansoegninger (webinar_tilmelding_id) where webinar_tilmelding_id is not null;

-- ── 6. Deltagelsen: bitmappen over sete 5-sekundersstykker ──────────────────
create table if not exists public.webinar_deltagelser (
  id               uuid primary key default gen_random_uuid(),
  tilmelding_id    uuid not null references public.webinar_tilmeldinger(id) on delete cascade,
  session_id       uuid not null references public.webinar_sessioner(id) on delete cascade,
  foerste_lobby_at timestamptz,
  foerste_ind_at   timestamptz,
  sidste_puls_at   timestamptz,
  -- Bit i = stykke i (i·5 … i·5+5 s) i byte ⌊i/8⌋, maske 1 << (i mod 8) — Postgres' get_bit/set_bit.
  set_bits         bytea,
  -- Samme, men kun mens fanen var synlig.
  synlig_bits      bytea,
  set_stykker      integer not null default 0 check (set_stykker >= 0),
  set_sek          integer not null default 0 check (set_sek >= 0),
  -- set_sek / varighed_sek · 100 — eWebinars skala. Går aldrig ned (greatest i webinar_puls_skriv).
  set_procent      numeric(5, 2) not null default 0 check (set_procent between 0 and 100),
  maks_pos_sek     numeric(8, 2),
  sen_indgang_sek  numeric(8, 2),
  enheder          integer not null default 0,
  korrektioner     integer not null default 0,
  afspillerfejl    integer not null default 0,
  lyd_til          boolean not null default false,
  -- { <enhed_id>: { seq, pos_sek, server_ms, tilstand } } — dedup og anker for pulsDom.
  enhed_tilstand   jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  unique (tilmelding_id, session_id)
);

create index if not exists webinar_deltagelser_session_puls_idx on public.webinar_deltagelser (session_id, sidste_puls_at);

-- ── 7. Pulsen: rå, append-only, 90 dage (opbevaringen er skive 2) ───────────
create table if not exists public.webinar_pulser (
  id                bigserial primary key,
  deltagelse_id     uuid not null references public.webinar_deltagelser(id) on delete cascade,
  enhed_id          text not null,
  seq               integer not null,
  modtaget_at       timestamptz not null default now(),
  klient_ms         bigint,
  pos_sek           numeric(8, 2),
  tilstand          text not null check (tilstand in ('lobby', 'spiller', 'pause', 'buffer', 'slut', 'skjult')),
  synlig            boolean,
  lyd               boolean,
  forventet_pos_sek numeric(8, 2),
  afvigelse_sek     numeric(8, 2),
  korrigeret        boolean,
  rum               text
);

create index if not exists webinar_pulser_modtaget_brin on public.webinar_pulser using brin (modtaget_at);
create index if not exists webinar_pulser_deltagelse_idx on public.webinar_pulser (deltagelse_id, modtaget_at);

-- ── 8. Hændelsesloggen (append-only, 24 mdr.) ───────────────────────────────
create table if not exists public.webinar_motor_log (
  id            bigserial primary key,
  tid           timestamptz not null default now(),
  -- Personen er tilmelding_id. ALDRIG mail, navn eller IP i data (spec §C2).
  tilmelding_id uuid references public.webinar_tilmeldinger(id) on delete set null,
  session_id    uuid references public.webinar_sessioner(id) on delete set null,
  art           text not null check (art in (
                  'side_vist', 'tilmeldt', 'flyttet', 'afmeldt', 'gen_tilmeldt', 'mail_sendt', 'ics_hentet',
                  'rum_aabnet', 'lydtest', 'gik_ind', 'genoptog', 'korrektion', 'pause', 'live_igen',
                  'afspillerfejl', 'forlod', 'interaktion_vist', 'svar', 'cta_klik', 'reaktion',
                  'spoergsmaal', 'haand', 'svar_leveret', 'exitrum', 'feedback', 'session_afsluttet',
                  'fremmoede_dom', 'klaviyo_sendt', 'ansoegning_fra_webinar')),
  data          jsonb not null default '{}'::jsonb,
  -- Idempotens for klienthændelser: samme klient_id fra samme tilmelding er én hændelse.
  klient_id     text check (klient_id is null or klient_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  -- Skrevet som «= any (array[…])», ikke «in (…)»: enumsMatcherDatabasen.guard læser
  -- den SENESTE «check (kilde in (…))» i en fil, der nævner public.ansoegninger, som
  -- ansøgningens kildeord — og denne fil tilføjer en kolonne på ansoegninger.
  kilde         text not null check (kilde = any (array['klient', 'server', 'cron', 'raadgiver']))
);

-- IKKE et delindeks: webinar-puls skriver med ON CONFLICT (tilmelding_id, klient_id),
-- og Postgres kan kun slutte sig til et delindeks, når konflikten nævner prædikatet.
-- Rækker uden klient_id (serverens egne) støder aldrig sammen: NULL er forskellig fra NULL.
create unique index if not exists webinar_motor_log_klient_uidx
  on public.webinar_motor_log (tilmelding_id, klient_id);
create index if not exists webinar_motor_log_session_art_idx on public.webinar_motor_log (session_id, art, tid);

-- ── 9. Svar (inkl. CTA-klik og feedback), reaktioner, spørgsmål ─────────────
create table if not exists public.webinar_svar (
  id                uuid primary key default gen_random_uuid(),
  deltagelse_id     uuid not null references public.webinar_deltagelser(id) on delete cascade,
  tilmelding_id     uuid not null references public.webinar_tilmeldinger(id) on delete cascade,
  session_id        uuid not null references public.webinar_sessioner(id) on delete cascade,
  interaktion_id    uuid not null references public.webinar_interaktioner(id),
  tidslinje_version integer not null,
  -- cta (klikket: { maal }) · feedback ({ stjerner, tekst? }) · poll · quiz · spoergsmaal_prompt.
  art               text not null check (art in ('cta', 'feedback', 'poll', 'quiz', 'spoergsmaal_prompt')),
  svar              jsonb not null,
  pos_sek           numeric(8, 2),
  svaret_at         timestamptz not null default now(),
  -- Ét svar pr. seer pr. interaktion — det første står.
  unique (deltagelse_id, interaktion_id)
);

create index if not exists webinar_svar_session_interaktion_idx on public.webinar_svar (session_id, interaktion_id);

create table if not exists public.webinar_reaktioner (
  session_id uuid not null references public.webinar_sessioner(id) on delete cascade,
  stykke     integer not null check (stykke >= 0),
  emoji      text not null check (length(emoji) between 1 and 16),
  antal      integer not null default 0 check (antal >= 0),
  primary key (session_id, stykke, emoji)
);

create table if not exists public.webinar_spoergsmaal (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.webinar_sessioner(id) on delete cascade,
  tilmelding_id   uuid not null references public.webinar_tilmeldinger(id) on delete cascade,
  tekst           text not null check (length(tekst) between 1 and 2000),
  -- null = stillet før start (i lobbyen).
  pos_sek         numeric(8, 2),
  stillet_at      timestamptz not null default now(),
  art             text not null default 'spoergsmaal' check (art in ('spoergsmaal', 'haand')),
  status          text not null default 'ny' check (status in ('ny', 'besvaret', 'afvist', 'auto')),
  svar_tekst      text check (svar_tekst is null or length(svar_tekst) between 1 and 4000),
  svaret_af       uuid references auth.users(id) on delete set null,
  svaret_at       timestamptz,
  leveret         text check (leveret is null or leveret in ('live', 'mail')),
  leveret_at      timestamptz,
  -- Kun kuraterede, rigtige spørgsmål vises for senere deltagere — anonymiseret, tydeligt mærket (G1).
  offentlig       boolean not null default false,
  offentlig_tekst text
);

create index if not exists webinar_spoergsmaal_session_idx on public.webinar_spoergsmaal (session_id, stillet_at desc);
create index if not exists webinar_spoergsmaal_tilmelding_idx on public.webinar_spoergsmaal (tilmelding_id) where status = 'besvaret' and leveret is null;

-- ── 10. RLS ─────────────────────────────────────────────────────────────────
alter table public.webinarer             enable row level security;
alter table public.webinar_gentagelser   enable row level security;
alter table public.webinar_sessioner     enable row level security;
alter table public.webinar_interaktioner enable row level security;
alter table public.webinar_deltagelser   enable row level security;
alter table public.webinar_pulser        enable row level security;
alter table public.webinar_motor_log     enable row level security;
alter table public.webinar_svar          enable row level security;
alter table public.webinar_reaktioner    enable row level security;
alter table public.webinar_spoergsmaal   enable row level security;

-- Service role gør alt (husets form, som webinar_tilmeldinger).
do $$
declare
  t text;
begin
  foreach t in array array['webinarer','webinar_gentagelser','webinar_sessioner','webinar_interaktioner',
                           'webinar_deltagelser','webinar_pulser','webinar_motor_log','webinar_svar',
                           'webinar_reaktioner','webinar_spoergsmaal'] loop
    execute format('drop policy if exists %I on public.%I', 'Service role can manage ' || t, t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', 'Service role can manage ' || t, t);
  end loop;
  -- Rådgivere LÆSER — men ikke den rå puls og ikke loggen (aggregaterne er nok).
  foreach t in array array['webinarer','webinar_gentagelser','webinar_sessioner','webinar_interaktioner',
                           'webinar_deltagelser','webinar_svar','webinar_reaktioner','webinar_spoergsmaal'] loop
    execute format('drop policy if exists %I on public.%I', 'Advisors can view ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_role(auth.uid(), %L))', 'Advisors can view ' || t, t, 'advisor');
  end loop;
end $$;

-- ── 11. Pulsens skrivning: ÉN transaktion pr. kald ──────────────────────────
-- SECURITY INVOKER (standard — IKKE definer, altså ingen berøring af de
-- forbudte), EXECUTE kun til service_role. Dedup på seq, OR af bits, antal nye
-- bits, pulsrækkerne og — når procenten krydser et helt tal — tilmeldingens
-- set_procent (eWebinars skala, så /webinar og dommene læser den uændret).
-- Regnestykket er webinarMotor/puls.ts:bitsTilProcent ordret:
--   set_sek     = least(set_stykker · 5, varighed_sek)
--   set_procent = round(least(100, set_sek · 100 / varighed_sek), 2), og aldrig lavere end før.
create or replace function public.webinar_puls_skriv(
  p_deltagelse_id  uuid,
  p_tilmelding_id  uuid,
  p_enhed          text,
  p_seq            integer,
  p_enhed_tilstand jsonb,
  p_fra            integer[],
  p_til            integer[],
  p_synlig_fra     integer[],
  p_synlig_til     integer[],
  p_antal_stykker  integer,
  p_varighed_sek   integer,
  p_maks_pos       numeric,
  p_lyd            boolean,
  p_korrektioner   integer,
  p_pulser         jsonb
)
returns table (ud_dublet boolean, ud_set_stykker integer, ud_set_procent numeric)
language plpgsql
set search_path = public
as $$
declare
  r        public.webinar_deltagelser%rowtype;
  v_bits   bytea;
  v_sbits  bytea;
  v_len    integer := (p_antal_stykker + 7) / 8;
  v_nye    integer := 0;
  v_i      integer;
  v_j      integer;
  v_gammel integer;
  v_stk    integer;
  v_sek    integer;
  v_pct    numeric(5, 2);
  v_tilst  jsonb;
begin
  if p_varighed_sek is null or p_varighed_sek <= 0 or p_antal_stykker is null or p_antal_stykker <= 0 then
    raise exception 'webinar_puls_skriv: ugyldig varighed' using errcode = '22023';
  end if;

  select * into r from public.webinar_deltagelser where id = p_deltagelse_id for update;
  if not found then
    raise exception 'webinar_puls_skriv: deltagelse % findes ikke', p_deltagelse_id using errcode = 'P0002';
  end if;

  -- Dedup: en seq ≤ den sidst skrevne for enheden er set før.
  v_gammel := nullif(r.enhed_tilstand -> p_enhed ->> 'seq', '')::integer;
  if v_gammel is not null and v_gammel >= p_seq then
    return query select true, r.set_stykker, r.set_procent;
    return;
  end if;

  v_bits  := coalesce(r.set_bits, ''::bytea);
  v_sbits := coalesce(r.synlig_bits, ''::bytea);
  if length(v_bits) < v_len then
    v_bits := v_bits || decode(repeat('00', v_len - length(v_bits)), 'hex');
  end if;
  if length(v_sbits) < v_len then
    v_sbits := v_sbits || decode(repeat('00', v_len - length(v_sbits)), 'hex');
  end if;

  for v_i in 1 .. coalesce(array_length(p_fra, 1), 0) loop
    for v_j in greatest(p_fra[v_i], 0) .. least(p_til[v_i], p_antal_stykker - 1) loop
      if get_bit(v_bits, v_j) = 0 then
        v_bits := set_bit(v_bits, v_j, 1);
        v_nye := v_nye + 1;
      end if;
    end loop;
  end loop;

  for v_i in 1 .. coalesce(array_length(p_synlig_fra, 1), 0) loop
    for v_j in greatest(p_synlig_fra[v_i], 0) .. least(p_synlig_til[v_i], p_antal_stykker - 1) loop
      v_sbits := set_bit(v_sbits, v_j, 1);
    end loop;
  end loop;

  v_stk   := r.set_stykker + v_nye;
  v_sek   := least(v_stk * 5, p_varighed_sek);
  v_pct   := greatest(r.set_procent, round(least(100::numeric, v_sek * 100.0 / p_varighed_sek), 2));
  v_tilst := r.enhed_tilstand || jsonb_build_object(p_enhed, p_enhed_tilstand);

  update public.webinar_deltagelser d
     set set_bits       = v_bits,
         synlig_bits    = v_sbits,
         set_stykker    = v_stk,
         set_sek        = v_sek,
         set_procent    = v_pct,
         maks_pos_sek   = greatest(coalesce(d.maks_pos_sek, 0), coalesce(p_maks_pos, 0)),
         sidste_puls_at = now(),
         enhed_tilstand = v_tilst,
         enheder        = (select count(*) from jsonb_object_keys(v_tilst)),
         lyd_til        = d.lyd_til or coalesce(p_lyd, false),
         korrektioner   = d.korrektioner + greatest(coalesce(p_korrektioner, 0), 0),
         updated_at     = now()
   where d.id = p_deltagelse_id;

  insert into public.webinar_pulser
    (deltagelse_id, enhed_id, seq, klient_ms, pos_sek, tilstand, synlig, lyd, forventet_pos_sek, afvigelse_sek, korrigeret, rum)
  select p_deltagelse_id, p_enhed, x.seq, x.klient_ms, x.pos_sek, x.tilstand, x.synlig, x.lyd,
         x.forventet_pos_sek, x.afvigelse_sek, x.korrigeret, x.rum
    from jsonb_to_recordset(coalesce(p_pulser, '[]'::jsonb)) as x(
      seq integer, klient_ms bigint, pos_sek numeric, tilstand text, synlig boolean, lyd boolean,
      forventet_pos_sek numeric, afvigelse_sek numeric, korrigeret boolean, rum text);

  -- Tilmeldingen (eWebinars kolonner) kun når procenten krydser et helt tal —
  -- én skrivning pr. procentpoint, ikke pr. puls. Går aldrig ned.
  update public.webinar_tilmeldinger t
     set set_procent = v_pct, set_procent_kilde = 'boardroom-bitmap'
   where t.id = p_tilmelding_id
     and (t.set_procent is null or floor(t.set_procent) < floor(v_pct));

  return query select false, v_stk, v_pct;
end;
$$;

-- Reaktionerne pr. 5-s-stykke: et atomisk +1 (de rå står i loggen).
create or replace function public.webinar_reaktion_tael(p_session_id uuid, p_stykke integer, p_emoji text)
returns void
language sql
set search_path = public
as $$
  insert into public.webinar_reaktioner (session_id, stykke, emoji, antal)
  values (p_session_id, p_stykke, p_emoji, 1)
  on conflict (session_id, stykke, emoji) do update set antal = public.webinar_reaktioner.antal + 1;
$$;

revoke all on function public.webinar_puls_skriv(uuid, uuid, text, integer, jsonb, integer[], integer[], integer[], integer[], integer, integer, numeric, boolean, integer, jsonb) from public, anon, authenticated;
grant execute on function public.webinar_puls_skriv(uuid, uuid, text, integer, jsonb, integer[], integer[], integer[], integer[], integer, integer, numeric, boolean, integer, jsonb) to service_role;
revoke all on function public.webinar_reaktion_tael(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.webinar_reaktion_tael(uuid, integer, text) to service_role;

-- ── EFTER-tjek (ét resultatsæt — kør og gem CSV) ────────────────────────────
select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
  from information_schema.tables where table_schema = 'public'
   and table_name in ('webinarer','webinar_sessioner','webinar_gentagelser','webinar_interaktioner',
                      'webinar_deltagelser','webinar_pulser','webinar_motor_log','webinar_svar',
                      'webinar_reaktioner','webinar_spoergsmaal')
union all
select '2 nye kolonner', concat(table_name, '.', column_name), data_type from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'webinar_tilmeldinger' and column_name in ('kilde_system','session_id','token_version',
         'samtykke_nyhedsbrev_at','fbp','fbc_cookie','ga_client_id','user_agent','fornavn','flyttet_fra_session_id','ip_dagshash'))
     or (table_name = 'ansoegninger' and column_name = 'webinar_tilmelding_id'))
union all
select '3 funktioner', p.proname, concat(pg_get_function_identity_arguments(p.oid), ' | definer=', p.prosecdef::text)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('webinar_puls_skriv','webinar_reaktion_tael','webinar_interaktion_uforanderlig')
union all
select '4 raekker', 'webinar_tilmeldinger', count(*)::text from public.webinar_tilmeldinger
union all
select '4 raekker', concat('kilde_system ', kilde_system), count(*)::text from public.webinar_tilmeldinger group by kilde_system
union all
select '5 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
union all
select '6 politikker', concat(tablename, ': ', policyname), concat(cmd, ' | ', roles::text) from pg_policies
 where schemaname = 'public'
   and tablename in ('webinarer','webinar_sessioner','webinar_gentagelser','webinar_interaktioner',
                     'webinar_deltagelser','webinar_pulser','webinar_motor_log','webinar_svar',
                     'webinar_reaktioner','webinar_spoergsmaal')
union all
select '7 execute', concat(f.navn, ' → ', r.rolle),
       has_function_privilege(r.rolle, f.sig, 'EXECUTE')::text
  from (values ('webinar_puls_skriv', 'public.webinar_puls_skriv(uuid, uuid, text, integer, jsonb, integer[], integer[], integer[], integer[], integer, integer, numeric, boolean, integer, jsonb)'),
               ('webinar_reaktion_tael', 'public.webinar_reaktion_tael(uuid, integer, text)')) as f(navn, sig)
  cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolle)
order by 1, 2;
