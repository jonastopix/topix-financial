-- KØRT i prod — 21/9-2026 kl. 15:50 (Jonas, Lovable SQL editor), FØR merge, med en vagt først. EFTER: rls true, 2 politikker, 0 rækker, meta_send_aktiv false.
-- RÆKKEFØLGEN: EFTER 20260921233000_ansoegninger_user_agent.sql, FØR udrulningen af
-- meta-send-cron (functionen skriver hertil; en manglende tabel vælter hver kørsel).
--
-- METAS CONVERSIONS API FRA PLATFORMEN (udkast 21/9-2026 aften, Jonas' beslutninger 1–7 i
-- _shared/metaSend.ts). Sporet: én række pr. hændelse (event_id = «<ansøgnings-id>:started» /
-- «:submitted», UNIK) med udfald, forsøg, Metas svar — tilstand + spor som klaviyo_profil.
-- Idempotensen er event_id: «sendt» sendes aldrig igen; «ugyldig» (400) prøves ikke igen;
-- ingen_noegle/fejl/timeout prøves igen ved hver kørsel, så længe hændelsen er under 7 dage gammel
-- (Metas vindue er loftet — intet forsøgsloft; rettelse 21/9 aften). Meta dedup'er selv på event_id.
--
-- LÅSEN: app_config.meta_send_aktiv, standard false — besluttet af Jonas 21/9-2026:
-- ingen jurist; låsen er bevisets, ikke juraens. Cronen tørkører, mens den er false;
-- beviset sendes med test_event_code (tilladt uden lås); står hændelsen rigtigt i Metas
-- Test events, slås låsen til med ÉN SQL:
--   UPDATE public.app_config SET config_value = 'true'::jsonb, updated_at = now() WHERE config_key = 'meta_send_aktiv';
-- og cronen sender for alvor fra næste kørsel. Slukkes igen med 'false'::jsonb.
--
-- RLS: rådgivere læser sporet; service_role alt; anon intet. app_config-rækken følger
-- tabellens egne politikker (admin-only).

create table if not exists public.meta_haendelser (
  event_id          text primary key,
  ansoegning_id     uuid not null references public.ansoegninger(id) on delete cascade,
  art               text not null,
  event_time        timestamptz not null,
  udfald            text not null,
  forsoeg           integer not null default 1,
  sidste_forsoeg_at timestamptz not null default now(),
  sendt_at          timestamptz,
  status            integer,
  events_received   integer,
  svar              text,
  fejl              text,
  test_event_code   text,
  varighed_ms       integer,
  created_at        timestamptz not null default now(),
  constraint meta_haendelser_art_check check (art in ('started', 'submitted')),
  constraint meta_haendelser_udfald_check check (udfald in ('sendt', 'fejl', 'timeout', 'ugyldig', 'ingen_noegle')),
  constraint meta_haendelser_event_id_form check (event_id = ansoegning_id::text || ':' || art),
  constraint meta_haendelser_sendt_hel check ((udfald = 'sendt') = (sendt_at is not null)),
  constraint meta_haendelser_forsoeg_check check (forsoeg >= 1)
);

create index if not exists meta_haendelser_ansoegning_idx on public.meta_haendelser (ansoegning_id);
create index if not exists meta_haendelser_udfald_idx on public.meta_haendelser (udfald, sidste_forsoeg_at desc);

comment on table public.meta_haendelser is
  'Sporet for platformens afsendelse til Metas Conversions API (21/9-2026): én række pr. hændelse (event_id unik = ansøgnings-id + :started/:submitted). Skrives kun af meta-send-cron (service role). Payloaden bærer aldrig persondata (fbc, hashet ansøgnings-id, user agent) — sporet gemmer kun Metas svar (events_received, fejl), aldrig payloaden.';

alter table public.meta_haendelser enable row level security;
create policy "Advisors can view meta haendelser"
  on public.meta_haendelser for select to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role));
create policy "Service role can manage meta haendelser"
  on public.meta_haendelser for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

-- Låsen — standard FALSE (bevisets lås, ikke juraens — Jonas 21/9-2026).
insert into public.app_config (config_key, config_value, description)
values ('meta_send_aktiv', 'false'::jsonb, 'Metas Conversions API: sender meta-send-cron for alvor? false = tørkørsel (standard). true sættes med én SQL, når beviset med test_event_code står rigtigt i Metas Test events (21/9-2026).')
on conflict (config_key) do nothing;

-- Efter-verifikation:
--   SELECT config_key, config_value FROM public.app_config WHERE config_key = 'meta_send_aktiv';   -- false
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'meta_haendelser';
-- Revert: drop table public.meta_haendelser; delete from public.app_config where config_key = 'meta_send_aktiv';
