-- Ansøgningsformularen (B, 18/9): KUN CVR-cachen. Tabellen ansoegninger
-- (B's tolv svar-kolonner ORDRET + motorens) kommer fra A's
-- 20260918200000_ansoegninger.sql; denne fil får derfor et timestamp EFTER
-- den og indeholder ingen CREATE TABLE ansoegninger, ingen politik, ingen
-- trigger på den. Token-opslaget hent_ansoegning_til_gem (B's tidligere
-- SECURITY DEFINER) er UDGÅET: verifyAnsoegningstoken slår op med service
-- role som A's verifyAnsoegningslink — ét mønster, ingen ny SECURITY DEFINER
-- (A's STOP D7 lukket fra B's side).
--
-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor EFTER 20260918200000.

-- ── CVR-cachen ────────────────────────────────────────────────────────────
-- Ét rigtigt opslag pr. CVR pr. 30 dage (README §4). Bærer KUN de syv
-- felter (svar) og visningen — aldrig DataCVR's rå body, aldrig ejere.
create table if not exists public.cvr_opslag_cache (
  cvr           text primary key check (cvr ~ '^\d{8}$'),
  udfald        text not null check (udfald in ('fundet','findes_ikke')),
  svar          jsonb,
  visning       jsonb,
  slaaet_op_at  timestamptz not null default now()
);
comment on table public.cvr_opslag_cache is
  'DataCVR-svar pr. CVR til ansoegningsformularen. Service-role-only. Aldrig den raa body.';
alter table public.cvr_opslag_cache enable row level security;
-- Ingen policies: kun service_role (omgår RLS) læser og skriver.

-- Efter-verifikation (Lovable SQL editor):
--   select relname, relrowsecurity from pg_class where relname = 'cvr_opslag_cache';
--   select count(*) from pg_policy where polrelid = 'public.cvr_opslag_cache'::regclass;  -- 0
