-- KØRT i prod 30/9-2026 ca. 20:10 via Lovable-MCP'en (i én transaktion). FØR: sektion 1–3 tomme, låsen «ikke sat → false», community_traade findes. EFTER: 3 tabeller · 3 SELECT-politikker (rådgivere) · 9 indeks · låsen «ikke sat → false».
-- KØRES FØR nyhed-agent-cron og nyhed-udkast-afgoer udrulles, og FØR Update (fladen /nyheder læser nyhed_udkast).
--
-- NYHEDSAGENTEN, SKIVE 1 (Jonas 30/9-2026: «En agent der altid holder øje med hvad der
-- sker af nyt i verdenen (tech, regler etc.) som er relevant for medlemmerne. Og så skal
-- der laves et opslag i community med nyhederne.» — godkendt). docs/agentarkitektur.md
-- §1.2 (tørkørsel, lås, spor), §1.3 (niveauer — nyhedsagenten er N1 PERMANENT) og §4.2.
--
-- TRE TABELLER, rent tilføjende (ingen ALTER, ingen DROP, ingen ændring af eksisterende):
--   nyhed_udkast         ugens udkast til ét community-opslag: kladde → publiceres →
--                        godkendt, eller → afvist. Én levende pr. uge (delvist unikt indeks).
--   nyhed_emne           hvert feed-emne, agenten har set — dedup på SHA-256 af den
--                        normaliserede URL (url_hash UNIQUE) — med LLM'ens vurdering.
--   nyhed_agent_koersel  sporet: én række pr. kørsel, OGSÅ tørkørslen.
--
-- RLS: rådgivere (has_role(auth.uid(), 'advisor') — admin arver) må LÆSE alle tre. Ingen
-- INSERT/UPDATE/DELETE-politik → kun service role skriver: cronen skriver udkast/emner/spor,
-- nyhed-udkast-afgoer (Bucket A, rådgiver-gate) skriver statusovergangene. Ingen anon.
-- has_role() røres IKKE — den kaldes kun.
--
-- INTET PUBLICERES AF DATABASEN ELLER CRONEN: nyhed_udkast.traad_id sættes først, når en
-- rådgiver HAR oprettet tråden gennem opret_community_traad i sin egen browser.
--
-- LÅSEN: app_config['nyhedsagent_aktiv'] (standard FALSE, sættes IKKE her). Uden den
-- skriver cronen intet, uanset dry_run. Slås til — efter tørkørslen — med:
--   insert into public.app_config (config_key, config_value, description)
--   values ('nyhedsagent_aktiv', 'true'::jsonb, 'Nyhedsagenten skriver ugens udkast (N1: rådgiveren publicerer)')
--   on conflict (config_key) do update set config_value = excluded.config_value;
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables
--    where table_schema = 'public' and table_name in ('nyhed_udkast', 'nyhed_emne', 'nyhed_agent_koersel')
--   union all
--   select '2 politikker', policyname, concat(tablename, ' | ', cmd) from pg_policies
--    where schemaname = 'public' and tablename in ('nyhed_udkast', 'nyhed_emne', 'nyhed_agent_koersel')
--   union all
--   select '3 indeks', indexname, tablename from pg_indexes
--    where schemaname = 'public' and tablename in ('nyhed_udkast', 'nyhed_emne', 'nyhed_agent_koersel')
--   union all
--   select '4 laasen', 'nyhedsagent_aktiv', coalesce((select config_value::text from public.app_config where config_key = 'nyhedsagent_aktiv'), 'ikke sat → false')
--   order by 1, 2;
--   FACIT FØR: sektion 1, 2 og 3 TOMME; sektion 4 «ikke sat → false».
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = 3 rækker; sektion 2 = 3 politikker (én SELECT
--   pr. tabel); sektion 3 = 3 primærnøgler + nyhed_emne_url_hash_key + 5 egne indeks
--   (nyhed_udkast_en_pr_uge_uidx, nyhed_udkast_status_idx, nyhed_emne_udgivet_idx,
--   nyhed_emne_brugt_idx, nyhed_agent_koersel_startet_idx) = 9; sektion 4 stadig «ikke sat → false».
--
-- ROLLBACK (tabellerne er nye; intet andet peger på dem):
--   drop table if exists public.nyhed_agent_koersel;
--   drop table if exists public.nyhed_emne;
--   drop table if exists public.nyhed_udkast;

-- ── 1. Udkastet ────────────────────────────────────────────────────────────
create table if not exists public.nyhed_udkast (
  id            uuid primary key default gen_random_uuid(),
  -- ISO-ugen for den DANSKE dag, kørslen skete (nyhedAgent.ts: ugeNoegle → isoUge.ts).
  uge           text not null check (uge ~ '^[0-9]{4}-W[0-9]{2}$'),
  titel         text not null check (btrim(titel) <> '' and char_length(titel) <= 200),
  -- Tiptap-dokumentet i community-motorens hvidliste — samme dørtjek som opret_community_traad.
  indhold_json  jsonb not null check (jsonb_typeof(indhold_json) = 'object' and indhold_json->>'type' = 'doc'),
  -- [{emne_id, kilde, titel, url, score, hvem, handling, begrundelse}] — grundlaget, rådgiveren ser.
  kilder        jsonb not null default '[]'::jsonb check (jsonb_typeof(kilder) = 'array'),
  status        text not null default 'kladde'
                check (status in ('kladde', 'publiceres', 'godkendt', 'afvist')),
  -- Sættes af nyhed-udkast-afgoer ved «publiceret» — tråden, rådgiveren oprettede.
  traad_id      uuid references public.community_traade(id) on delete set null,
  afgjort_af    uuid references auth.users(id) on delete set null,
  afgjort_at    timestamptz,
  afvist_grund  text check (afvist_grund is null or char_length(afvist_grund) <= 500),
  -- Godkendt med samme titel og samme tekst som agentens udkast (arkitekturen §1.3: træfsikkerheden måles på «uændret»).
  uaendret      boolean,
  model         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint nyhed_udkast_godkendt_har_traad check (status <> 'godkendt' or traad_id is not null)
);

comment on table public.nyhed_udkast is
  'Nyhedsagentens ugentlige udkast til ét community-opslag (skive 1, 30/9-2026). N1: publiceres KUN af en rådgivers klik på /nyheder gennem opret_community_traad. Skrives kun af service role (nyhed-agent-cron, nyhed-udkast-afgoer); rådgivere læser.';

-- Én levende pr. uge: to samtidige kørsler kan ikke begge skrive ugens udkast. Et afvist udkast spærrer ikke.
create unique index if not exists nyhed_udkast_en_pr_uge_uidx
  on public.nyhed_udkast (uge) where status in ('kladde', 'publiceres', 'godkendt');
create index if not exists nyhed_udkast_status_idx
  on public.nyhed_udkast (status, created_at desc);

-- ── 2. Emnerne (dedup) ─────────────────────────────────────────────────────
create table if not exists public.nyhed_emne (
  id                 uuid primary key default gen_random_uuid(),
  -- SHA-256 (hex) af den normaliserede URL (nyhedAgent.ts: normaliserUrl) — dedup-nøglen.
  url_hash           text not null unique check (url_hash ~ '^[0-9a-f]{64}$'),
  url                text not null check (url ~ '^https://'),
  -- KILDER[].noegle i nyhedAgent.ts.
  kilde              text not null,
  titel              text not null,
  resume             text,
  -- Feedets egen dato — en observation, ikke en nøgle.
  udgivet_at         timestamptz,
  hentet_at          timestamptz not null default now(),
  -- LLM'ens vurdering, dømt af validerVurderinger (skema) før den står her.
  score              smallint check (score is null or score between 0 and 10),
  relevant           boolean,
  hvem               text,
  handling           text,
  begrundelse        text,
  vurderet_at        timestamptz,
  model              text,
  brugt_i_udkast_id  uuid references public.nyhed_udkast(id) on delete set null
);

comment on table public.nyhed_emne is
  'Hvert feed-emne nyhedsagenten har set; url_hash (SHA-256 af normaliseret URL) er dedup-nøglen. Kun offentlige feed-felter — ingen persondata. Skrives kun af service role; rådgivere læser.';

create index if not exists nyhed_emne_udgivet_idx on public.nyhed_emne (udgivet_at desc);
create index if not exists nyhed_emne_brugt_idx on public.nyhed_emne (brugt_i_udkast_id);

-- ── 3. Sporet ──────────────────────────────────────────────────────────────
create table if not exists public.nyhed_agent_koersel (
  id             uuid primary key default gen_random_uuid(),
  startet_at     timestamptz not null,
  sluttet_at     timestamptz not null default now(),
  dry_run        boolean not null,
  -- dry_run = false OG låsen.
  skriver        boolean not null default false,
  status         text not null check (status in ('ok', 'fejl')),
  stop_grund     text,
  uge            text,
  hentet         integer not null default 0,
  nye            integer not null default 0,
  vurderet       integer not null default 0,
  relevante      integer not null default 0,
  llm_kald       integer not null default 0,
  -- Fra gatewayens usage — prisen pr. token er UMÅLT og skrives ikke (nyhedAgent.ts, lofterne).
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  model          text,
  kilder         jsonb not null default '[]'::jsonb,
  udkast_id      uuid references public.nyhed_udkast(id) on delete set null,
  svar           jsonb
);

comment on table public.nyhed_agent_koersel is
  'Nyhedsagentens spor: én række pr. kørsel, også tørkørsler (arkitekturen §1.2). Skrives kun af service role; rådgivere læser.';

create index if not exists nyhed_agent_koersel_startet_idx on public.nyhed_agent_koersel (startet_at desc);

-- ── 4. RLS: rådgivere læser, ingen klient skriver ──────────────────────────
alter table public.nyhed_udkast enable row level security;
alter table public.nyhed_emne enable row level security;
alter table public.nyhed_agent_koersel enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nyhed_udkast' and policyname = 'Raadgivere laeser nyhedsudkast') then
    create policy "Raadgivere laeser nyhedsudkast" on public.nyhed_udkast
      for select to authenticated using (public.has_role(auth.uid(), 'advisor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nyhed_emne' and policyname = 'Raadgivere laeser nyhedsemner') then
    create policy "Raadgivere laeser nyhedsemner" on public.nyhed_emne
      for select to authenticated using (public.has_role(auth.uid(), 'advisor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nyhed_agent_koersel' and policyname = 'Raadgivere laeser nyhedsagentens spor') then
    create policy "Raadgivere laeser nyhedsagentens spor" on public.nyhed_agent_koersel
      for select to authenticated using (public.has_role(auth.uid(), 'advisor'));
  end if;
end $$;

-- ── 5. EFTER (ét resultatsæt — samme som FØR-SQL i filhovedet) ─────────────
select '1 tabeller' as sektion, table_name::text as noegle, 'findes' as vaerdi
  from information_schema.tables
 where table_schema = 'public' and table_name in ('nyhed_udkast', 'nyhed_emne', 'nyhed_agent_koersel')
union all
select '2 politikker', policyname::text, concat(tablename, ' | ', cmd) from pg_policies
 where schemaname = 'public' and tablename in ('nyhed_udkast', 'nyhed_emne', 'nyhed_agent_koersel')
union all
select '3 indeks', indexname::text, tablename::text from pg_indexes
 where schemaname = 'public' and tablename in ('nyhed_udkast', 'nyhed_emne', 'nyhed_agent_koersel')
union all
select '4 laasen', 'nyhedsagent_aktiv', coalesce((select config_value::text from public.app_config where config_key = 'nyhedsagent_aktiv'), 'ikke sat → false')
order by 1, 2;
