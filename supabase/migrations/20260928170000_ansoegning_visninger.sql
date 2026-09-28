-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- Og FØR ansoegning-gem udrulles: grenen «spor» skriver hertil. Mangler tabellen,
-- svarer grenen 500, fladen mærker intet (sporet er fire-and-forget), men intet
-- gemmes. «opret»s kobling (update ansoegning_id) er fail-soft og logges.
--
-- VISNINGEN AF ANSØGNINGEN (udkast 28/9-2026, ~/Downloads/udkast-ansoegning-visning/):
-- tre anonyme trin FØR en ansøgning findes — vist, start, tastet — så frafaldet
-- mellem klikket og CVR-skærmens «Slå op» kan måles pr. kilde og pr. dag
-- (recon-ansoegning-frafald-hvorfor.md §4 A). Én række pr. (visning_id, trin).
--
-- INGEN PERSONDATA: kilde, kilde_raa, annoncesporets otte felter, user agent og
-- IP'ens dagshash. Ingen navn, e-mail, telefon, CVR, svar, rå IP eller token.
-- visning_id er et tilfældigt uuid, der KUN lever i sidens hukommelse — det
-- gemmes aldrig på den besøgendes enhed.
--
-- SERVICE-ROLE-ONLY: RLS slået til, INGEN policies. Kun ansoegning-gem (service
-- role) skriver; læsning sker i SQL editor. Ingen klient læser eller skriver.
--
-- kilde har BEVIDST ingen CHECK: ansoegning-gem snævrer den til KILDER («andet»
-- for alt ukendt), og en CHECK her skulle rettes i takt, hver gang KILDER vokser
-- (senest «nyhedsbrev», 20260928140000) — ellers afvises hver sporrække.
--
-- FØR-SQL:
--   select to_regclass('public.ansoegning_visninger');   -- FACIT FØR: null. EFTER: ansoegning_visninger.
-- EFTER-SQL:
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='ansoegning_visninger' order by ordinal_position;  -- 17 kolonner
--   select relrowsecurity from pg_class where relname='ansoegning_visninger';                     -- true
--   select count(*) from pg_policies where tablename='ansoegning_visninger';                        -- 0
--
-- ROLLBACK:
--   drop table if exists public.ansoegning_visninger;

create table if not exists public.ansoegning_visninger (
  id uuid primary key default gen_random_uuid(),
  visning_id uuid not null,
  trin text not null check (trin in ('vist', 'start', 'tastet')),
  kilde text not null,
  kilde_raa text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  landing text,
  referrer text,
  user_agent text,
  ip_hash text not null,
  ansoegning_id uuid references public.ansoegninger(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ansoegning_visninger_et_pr_trin unique (visning_id, trin)
);

create index if not exists ansoegning_visninger_created_at_idx on public.ansoegning_visninger (created_at);
create index if not exists ansoegning_visninger_ip_tid_idx on public.ansoegning_visninger (ip_hash, created_at);
create index if not exists ansoegning_visninger_ansoegning_idx on public.ansoegning_visninger (ansoegning_id) where ansoegning_id is not null;

alter table public.ansoegning_visninger enable row level security;

comment on table public.ansoegning_visninger is
  'Anonyme trin før en ansøgning findes (vist/start/tastet), skrevet af ansoegning-gem «spor». Service-role-only. Udkast 28/9-2026.';
