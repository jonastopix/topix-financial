-- KØRT i prod — 21/9-2026 kl. 21:15 (Jonas, Lovable SQL editor), efter merge, med en vagt først. EFTER: rls true/true, 5 politikker, trigger 1.
-- RÆKKEFØLGEN — LÆS DEN (CLAUDE.md «Deployment af edge functions»):
--   1. DENNE migration (tabellerne) — FØR udrulningen. Mål:
--      GET /rest/v1/webinar_delinger?select=id&limit=0 → 200 (anon-nøglen fra bundlen).
--   2. merge til main (kilden lander hos Lovable; den kører ikke)
--   3. EKSPLICIT deploy af webinar-deling OG webinar-delt fra Lovables build-chat — bed den
--      KØRE deploy-værktøjet og vise resultatet; en NY function er aldrig i drift, før det er sket
--   4. Update (fladen: /webinar får «Del med et privat link», og /delt/webinar findes)
--   5. BEVISET: opret et link på /webinar, åbn det i et privat vindue → tallene står, ingen skal.
--      Og curl mod functionen — svaret må ikke indeholde én mailadresse:
--        curl -s -X POST "$SUPABASE_URL/functions/v1/webinar-delt" -H "apikey: $ANON" -H "Content-Type: application/json" \
--          -d '{"t":"<tokenet fra oprettelsen>"}' | grep -c '@'      → 0
--      Sporet: SELECT haendelse, tidspunkt, ip FROM public.webinar_deling_spor ORDER BY id DESC LIMIT 5;
--
-- /WEBINAR DELT MED EN EKSTERN GENNEM ET PRIVAT LINK (udkast 21/9-2026, recon-webinar-deling.md):
-- én række pr. modtager (navn, hvem, hvornår, udløb, lukket) og et insert-only spor pr. visning.
--
-- TOKENET GEMMES KUN SOM SHA-256-AFTRYK (token_aftryk) — NYT I HUSET (aftale/ansøgning/betaling
-- gemmer uuid i klartekst). Begrundelsen i _shared/delingstokenAuth.ts: linket åbner ALLE /webinars
-- tal for en person uden konto i 90 dage, og rækken skal kunne læses af rådgiverne (listen) gennem
-- RLS — et klartekst-token i en SELECT-bar tabel er en færdig adgang. Aftrykket kan ikke bruges
-- til at åbne linket. Selve tokenet findes kun i svaret ved oprettelsen (vist én gang) og i
-- modtagerens link. Opslaget sker med service role på aftryk-lighed, derefter konstant-tid-
-- sammenligning i koden.
--
-- RLS: anon INTET (ingen politik); service_role ALT; rådgivere LÆSER begge tabeller (listen:
-- navn, udløb, sidst set, antal visninger — udledt af sporet i fladen). Rådgivere SKRIVER IKKE
-- selv: opret/forlæng/luk går gennem webinar-deling (Bucket A, has_role advisor), så en deling
-- aldrig findes uden spor. Ingen SECURITY DEFINER, ingen anon-RPC: én kanal, edge-functionen.
--
-- SPORET (rettet 21/9, to fund i gennemgangen):
--   1. deling_id er NOT NULL, og der findes ingen hændelse «afvist_ukendt»: et UKENDT token skrives
--      ALDRIG i sporet (webinar-delt logger det kun) — sporet kan ikke slettes, og uden rate-limit
--      kunne en fremmed ellers fylde det med rækker, der aldrig kan fjernes. Migrationen er ikke
--      kørt, så der findes ingen gamle rækker at kunne læse; værdien fjernes fra CHECK'en.
--   2. Append-only MED cascade: protect_webinar_deling_spor er SPEJLET af protect_aftale_spor
--      (20260918290000_aftale_uforanderlig.sql:113-131), ordret i logik — citeret:
--        «UPDATE afvises altid. DELETE afvises når den er DIREKTE (pg_trigger_depth() <= 1 inde i
--         triggeren); en DELETE der følger af at aftalen slettes (ON DELETE CASCADE …) tillades,
--         for der kører den inde i RI-triggeren (depth 2).»
--        og i funktionen: «if pg_trigger_depth() <= 1 then raise exception … cannot be deleted directly»
--      Uden undtagelsen kunne en deling aldrig slettes (cascaden ville fejle), oprettet_af (on delete
--      restrict) ville låse rådgiveren for altid, og den eksternes IP/user-agent stod for evigt.
--      Prøven på SQL'en: src/lib/__tests__/webinarDeling.guard.test.ts dom 4. En kørsel i en rigtig
--      Postgres er IKKE lavet her (ingen lokal/WASM-Postgres i miljøet) — kør prøven i EFTER-SQL
--      nedenfor i en transaktion, der rulles tilbage.

-- ── 1. Delingerne ──────────────────────────────────────────────────────

create table if not exists public.webinar_delinger (
  id            uuid primary key default gen_random_uuid(),
  navn          text not null,
  token_aftryk  text not null,
  oprettet_af   uuid not null references auth.users(id) on delete restrict,
  oprettet_at   timestamptz not null default now(),
  udloeber_at   timestamptz not null,
  lukket_at     timestamptz,
  constraint webinar_delinger_aftryk_unik unique (token_aftryk),
  constraint webinar_delinger_aftryk_form check (token_aftryk ~ '^[0-9a-f]{64}$'),
  constraint webinar_delinger_navn_check check (char_length(navn) between 1 and 80),
  constraint webinar_delinger_udloeb_efter_oprettelse check (udloeber_at > oprettet_at)
);

create index if not exists webinar_delinger_oprettet_idx on public.webinar_delinger (oprettet_at desc);

comment on table public.webinar_delinger is
  'Private links til /webinar for eksterne (udkast 21/9-2026). Én række pr. modtager. token_aftryk er SHA-256 hex over tokenet i linket app.theboardroom.dk/delt/webinar?t=<43 tegn base64url> — tokenet selv gemmes ALDRIG (vist én gang ved oprettelsen). Dommen aktiv/udløbet/lukket regnes af _shared/webinarDeling.ts (lukket vinder; udløbet ved udloeber_at). Læses serverside af webinar-delt (service role, verifyDelingstoken) og af rådgiverne (listen). Skrives kun af webinar-deling (Bucket A).';

comment on column public.webinar_delinger.token_aftryk is
  'SHA-256 hex (64 tegn) over tokenet. Opslag på lighed med service role, derefter konstant-tid-sammenligning i koden (delingstokenAuth.ts). Kan ikke bruges til at åbne linket.';

-- ── 2. Sporet ──────────────────────────────────────────────────────────

create table if not exists public.webinar_deling_spor (
  id          bigint generated always as identity primary key,
  deling_id   uuid not null references public.webinar_delinger(id) on delete cascade,
  tidspunkt   timestamptz not null default now(),
  haendelse   text not null,
  ip          text,
  user_agent  text,
  detaljer    jsonb,
  constraint webinar_deling_spor_haendelse_check check (haendelse in (
    'oprettet', 'forlaenget', 'lukket', 'vist', 'afvist_udloebet', 'afvist_lukket'
  ))
);

create index if not exists webinar_deling_spor_deling_idx on public.webinar_deling_spor (deling_id, tidspunkt);

comment on table public.webinar_deling_spor is
  'Sporet for de private links — altid på en KENDT deling (deling_id NOT NULL): oprettet/forlænget/lukket (rådgiveren, id i detaljer), vist (hver åbning), afvist_udloebet/_lukket (grunden står HER, aldrig i svaret). Et ukendt token skrives aldrig her (kun i webinar-delts log). ip og user_agent fra request-headerne som aftale_spor. Append-only: ingen UPDATE/DELETE-politik; protect_webinar_deling_spor nægter UPDATE altid og DELETE direkte — kun cascaden fra webinar_delinger (pg_trigger_depth() > 1) må tage sporet med.';

-- Append-only, også for service_role — SPEJL af protect_aftale_spor (20260918290000:113-131):
-- UPDATE afvises altid; DELETE afvises kun DIREKTE (pg_trigger_depth() <= 1 inde i triggeren).
-- Cascaden fra webinar_delinger kører inde i RI-triggeren (depth 2) og slipper igennem, så en
-- deling KAN slettes med sit spor (persondata-sletning; oprettet_af er on delete restrict).
create or replace function public.protect_webinar_deling_spor()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'webinar_deling_spor is append-only: rows cannot be updated';
  end if;
  -- DELETE: kun som følge af en cascade (delingen slettes). pg_trigger_depth() er 1 INDE i denne
  -- trigger ved en direkte DELETE; ved en cascade fra webinar_delinger er den 2 (protect_aftale_spor).
  if pg_trigger_depth() <= 1 then
    raise exception 'webinar_deling_spor is append-only: rows cannot be deleted directly';
  end if;
  return old;
end;
$$;

comment on function public.protect_webinar_deling_spor() is
  'BEFORE UPDATE OR DELETE på webinar_deling_spor: ingen UPDATE; DELETE kun som cascade fra webinar_delinger (pg_trigger_depth() > 1) — aldrig direkte. Spejl af protect_aftale_spor.';

drop trigger if exists trg_protect_webinar_deling_spor on public.webinar_deling_spor;
create trigger trg_protect_webinar_deling_spor
  before update or delete on public.webinar_deling_spor
  for each row execute function public.protect_webinar_deling_spor();

-- ── 3. RLS ─────────────────────────────────────────────────────────────

alter table public.webinar_delinger    enable row level security;
alter table public.webinar_deling_spor enable row level security;

-- Rådgivere læser (listen). De skriver ikke selv — det gør webinar-deling med service role.
create policy "Advisors can view webinar delinger"
  on public.webinar_delinger for select to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role));
create policy "Service role can manage webinar delinger"
  on public.webinar_delinger for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

create policy "Advisors can view webinar deling spor"
  on public.webinar_deling_spor for select to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role));
-- Kun INSERT og SELECT for service_role: sporet ændres og slettes aldrig (triggeren ovenfor nægter det også).
create policy "Service role can insert webinar deling spor"
  on public.webinar_deling_spor for insert
  with check (auth.role() = 'service_role'::text);
create policy "Service role can view webinar deling spor"
  on public.webinar_deling_spor for select
  using (auth.role() = 'service_role'::text);

-- Efter-verifikation:
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('webinar_delinger','webinar_deling_spor') ORDER BY 1, 2;
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_webinar_deling_spor';
--   -- PRØVEN på sporet (i én transaktion, rulles tilbage; kræver en rådgiver-uuid i auth.users):
--   begin;
--     insert into public.webinar_delinger (id, navn, token_aftryk, oprettet_af, udloeber_at)
--       values ('00000000-0000-4000-8000-000000000001', 'proeve', repeat('0', 64), '<rådgiver-uuid>', now() + interval '1 day');
--     insert into public.webinar_deling_spor (deling_id, haendelse) values ('00000000-0000-4000-8000-000000000001', 'oprettet');
--     savepoint s1; delete from public.webinar_deling_spor where deling_id = '00000000-0000-4000-8000-000000000001';
--       -- forventet: ERROR … cannot be deleted directly
--     rollback to s1;
--     savepoint s2; update public.webinar_deling_spor set ip = 'x' where deling_id = '00000000-0000-4000-8000-000000000001';
--       -- forventet: ERROR … cannot be updated
--     rollback to s2;
--     delete from public.webinar_delinger where id = '00000000-0000-4000-8000-000000000001';
--       -- forventet: DELETE 1, og sporet er væk (cascaden slap igennem):
--     select count(*) from public.webinar_deling_spor where deling_id = '00000000-0000-4000-8000-000000000001';  -- 0
--   rollback;
-- Revert: drop table public.webinar_deling_spor; drop table public.webinar_delinger; drop function public.protect_webinar_deling_spor();
