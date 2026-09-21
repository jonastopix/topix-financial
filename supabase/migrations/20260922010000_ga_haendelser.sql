-- KØRT i prod — 21/9-2026 kl. 17:48 (Jonas, Lovable SQL editor), FØR merge, med en vagt først. EFTER: rls true, 2 politikker, 0 rækker, ga_send_aktiv false.
-- RÆKKEFØLGEN: EFTER 20260922003000_ansoegninger_ga.sql (kolonnerne ga_client_id og
-- ga_session_id — uden dem har cronen intet at sende) og FØR udrulningen af ga-send-cron
-- (functionen skriver hertil; en manglende tabel vælter hver kørsel).
--
-- GOOGLE ANALYTICS FRA PLATFORMEN (udkast 21/9-2026 aften, chatten; docs/tracking.md §1c).
-- Sporet: én række pr. hændelse (event_id = «<ansøgnings-id>:started» / «:submitted», UNIK).
--
-- HVORFOR SPORET ER DEN ENESTE IDEMPOTENS: Metas Conversions API deduplikerer selv på
-- event_id; Measurement Protocol gør IKKE — sendes den samme hændelse to gange, tælles den
-- to gange i GA4. Derfor er «sendt» endelig: den række sendes aldrig igen.
--
-- INTET FORSØGSLOFT — VINDUET ER LOFTET: Google accepterer backdating i 72 timer
-- («Events and user properties can be backdated up to 72 hours»), og Measurement Protocol
-- svarer aldrig med en fejlkode («The Google Analytics Measurement Protocol does not return
-- HTTP error codes»), så et «fejl» er netværk eller 5xx — forbigående af natur. En hændelse
-- prøves derfor ved hver kørsel, indtil den er sendt eller falder ud af vinduet.
--
-- LÅSEN: app_config.ga_send_aktiv, standard false — bevisets lås. Cronen tørkører, indtil
-- payloaden er valideret mod Googles /debug/mp/collect og ÉN rigtig hændelse er set i
-- Realtime. Så slås den til med ÉN SQL:
--   UPDATE public.app_config SET config_value = 'true'::jsonb, updated_at = now() WHERE config_key = 'ga_send_aktiv';
-- og cronen sender for alvor fra næste kørsel. Slukkes igen med 'false'::jsonb.
--
-- RLS: rådgivere læser sporet; service_role alt; anon intet.
--
-- FØR-SQL (gem svaret): select count(*) from information_schema.tables where table_schema='public' and table_name='ga_haendelser';  -- 0

create table if not exists public.ga_haendelser (
  event_id          text primary key,
  ansoegning_id     uuid not null references public.ansoegninger(id) on delete cascade,
  art               text not null,
  event_time        timestamptz not null,
  udfald            text not null,
  forsoeg           integer not null default 1,
  sidste_forsoeg_at timestamptz not null default now(),
  sendt_at          timestamptz,
  status            integer,
  validering        jsonb,
  svar              text,
  fejl              text,
  debug             boolean not null default false,
  varighed_ms       integer,
  created_at        timestamptz not null default now(),
  constraint ga_haendelser_art_check check (art in ('started', 'submitted')),
  constraint ga_haendelser_udfald_check check (udfald in ('sendt', 'fejl', 'timeout', 'ugyldig', 'ingen_noegle')),
  constraint ga_haendelser_event_id_form check (event_id = ansoegning_id::text || ':' || art),
  constraint ga_haendelser_sendt_hel check ((udfald = 'sendt') = (sendt_at is not null)),
  constraint ga_haendelser_forsoeg_check check (forsoeg >= 1)
);

create index if not exists ga_haendelser_ansoegning_idx on public.ga_haendelser (ansoegning_id);
create index if not exists ga_haendelser_udfald_idx on public.ga_haendelser (udfald, sidste_forsoeg_at desc);

comment on table public.ga_haendelser is
  'Sporet for platformens afsendelse til Google Analytics 4 (Measurement Protocol, 21/9-2026): én række pr. hændelse (event_id unik = ansøgnings-id + :started/:submitted). Skrives kun af ga-send-cron (service role). Payloaden bærer aldrig persondata (client_id, session_id, kilde/utm) — sporet gemmer Googles svar og valideringsbeskeder, aldrig payloaden. debug = true betyder, at kaldet gik til /debug/mp/collect, som ikke lander i GA4s rapporter.';
comment on column public.ga_haendelser.validering is
  'validationMessages fra Googles valideringsserver (fieldPath, description, validationCode). Kun sat ved debug-kørsler — produktions-endpointet svarer aldrig med fejl.';

alter table public.ga_haendelser enable row level security;
create policy "Advisors can view ga haendelser"
  on public.ga_haendelser for select to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role));
create policy "Service role can manage ga haendelser"
  on public.ga_haendelser for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

-- Låsen — standard FALSE (bevisets lås).
insert into public.app_config (config_key, config_value, description)
values ('ga_send_aktiv', 'false'::jsonb, 'Google Analytics: sender ga-send-cron for alvor? false = tørkørsel (standard). true sættes med én SQL, når payloaden er valideret mod /debug/mp/collect og én rigtig hændelse er set i GA4 Realtime (21/9-2026).')
on conflict (config_key) do nothing;

-- EFTER-tjek (kør og gem):
--   select config_key, config_value from public.app_config where config_key = 'ga_send_aktiv';   -- false
--   select tablename, policyname, cmd from pg_policies where tablename = 'ga_haendelser' order by policyname;
-- ROLLBACK: drop table public.ga_haendelser; delete from public.app_config where config_key = 'ga_send_aktiv';
