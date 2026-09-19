-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge.
--
-- SPORET EFTER HVER KLAVIYO-HÆNDELSE (udkast 19/9-2026) — lag 2 af fire.
--
-- HVORFOR EN TABEL OG IKKE BARE EN LOG: planen er en agent i platformen, der
-- selv kan bygge og skrive Klaviyo-flows (lag 4). Den dag den skriver, skal
-- ALT kunne læses bagud — hvad vi sendte, hvad Klaviyo svarede, og hvad der
-- ikke blev til noget. En console.log i en edge function kan ikke sammenkøres
-- med en ansøgning tre uger senere; en række kan.
--
-- DEN LOGGER OGSÅ DET, DER IKKE BLEV SENDT. Mangler nøglen, står udfaldet
-- «ingen_noegle» med en række — så «vi har ingen hændelser» kan skelnes fra
-- «vi sendte, og Klaviyo afviste». De to har helt forskellige årsager.
--
-- INGEN UNIKHEDSREGEL PÅ (metric, unikt_id) MED VILJE. Dubletter afvises hos
-- KLAVIYO (dokumenteret: gentages unique_id for samme profil og metric,
-- «only the first processed event will be recorded»). Vores spor skal derimod
-- vise HVER gang vi forsøgte — også gensendelserne fra stripe-webhooken.
-- Et spor, der skjuler forsøg, er ikke et spor.
--
-- MAILEN STÅR I KLARTEKST, fordi det er den, der blev sendt til Klaviyo, og
-- fordi sporet skal kunne kobles til en ansøgning. Tabellen er service-role-
-- only; rådgivere får SELECT, så fladen senere kan vise «sendt til Klaviyo».
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabel' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables where table_schema='public' and table_name='klaviyo_haendelser'
--   union all
--   select '2 politikker', policyname, concat(cmd,' | ',roles::text) from pg_policies
--     where schemaname='public' and tablename='klaviyo_haendelser'
--   union all
--   select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen','YYYY-MM-DD HH24:MI:SS')
--   order by 1,2;
--   FACIT FØR: sektion 1 og 2 TOMME.
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = 1 række; sektion 2 = 2 politikker.
--
-- ROLLBACK:
--   drop table if exists public.klaviyo_haendelser;

create table if not exists public.klaviyo_haendelser (
  id            uuid primary key default gen_random_uuid(),
  sendt_at      timestamptz not null default now(),
  -- Metric-navnet i Klaviyo: «Ansoegning paabegyndt» · «Ansoegning sendt» · «Blev medlem».
  metric        text not null,
  -- Profilen hos Klaviyo findes på mailen; altid små bogstaver, som resten af huset.
  email         text not null check (email = lower(email)),
  -- VORES id. Klaviyos dubletnøgle sammen med (profil, metric).
  unikt_id      text not null,
  -- ok · ingen_noegle · noegle_afvist · loft · ugyldig · fejl · timeout (_shared/klaviyo.ts).
  udfald        text not null,
  status        integer,
  varighed_ms   integer,
  -- Præcis den krop vi sendte — så lag 3 kan se, hvad Klaviyo fik.
  sendt         jsonb not null,
  -- Klaviyos svar, afkortet. 202 har tom krop; fejl har en forklaring.
  svar          text,
  grund         text
);

create index if not exists klaviyo_haendelser_metric_idx  on public.klaviyo_haendelser (metric, sendt_at desc);
create index if not exists klaviyo_haendelser_email_idx   on public.klaviyo_haendelser (email);
create index if not exists klaviyo_haendelser_unikt_idx   on public.klaviyo_haendelser (unikt_id);
create index if not exists klaviyo_haendelser_udfald_idx  on public.klaviyo_haendelser (udfald) where udfald <> 'ok';

comment on table public.klaviyo_haendelser is
  'Spor efter hver hændelse sendt til Klaviyo (udkast 19/9-2026, lag 2). Én række pr. FORSØG — også dem uden nøgle og dem Klaviyo afviste. Dubletter afvises hos Klaviyo på unique_id, ikke her. Kun service role skriver; rådgivere læser.';

alter table public.klaviyo_haendelser enable row level security;

drop policy if exists "Advisors can view klaviyo haendelser" on public.klaviyo_haendelser;
create policy "Advisors can view klaviyo haendelser"
  on public.klaviyo_haendelser for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage klaviyo haendelser" on public.klaviyo_haendelser;
create policy "Service role can manage klaviyo haendelser"
  on public.klaviyo_haendelser for all to service_role
  using (true) with check (true);

-- EFTER-tjek (kør og gem CSV):
select '1 tabel' as sektion, table_name as noegle, 'findes' as vaerdi
  from information_schema.tables where table_schema='public' and table_name='klaviyo_haendelser'
union all
select '2 politikker', policyname, concat(cmd,' | ',roles::text) from pg_policies
  where schemaname='public' and tablename='klaviyo_haendelser'
union all
select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen','YYYY-MM-DD HH24:MI:SS')
order by 1,2;
