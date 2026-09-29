-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «DIT CERTIFIKAT», TRIN 1 (29/9-2026, ~/Downloads/boardroom-certifikat/HANDOFF.md §6
-- og ~/Downloads/recon-certifikat.md): et bevis på 12 måneders medlemskab, som
-- medlemmet selv henter som PDF/PNG på /certifikat. Området åbner 7 dage før
-- 12-månedersdatoen, regnet af companies.contract_start_date (DATE), som fladen
-- læser som DANSK kalenderdato (split «YYYY-MM-DD», aldrig new Date("YYYY-MM-DD")).
-- NULL i contract_start_date = området er skjult (fladen kan ikke regne en dato).
--
-- TO TING:
--   1) companies.certificate_eligible boolean NOT NULL DEFAULT false — flaget for
--      det første hold, der har fået certifikatet lovet. Jonas sætter det selv i
--      SQL; ingen admin-UI (HANDOFF §6.1). Flaget bor på VIRKSOMHEDEN (medlemmet
--      findes via company_members / user_company_id), så to brugere i samme
--      virksomhed får hver deres certifikat med eget navn og eget portræt.
--   2) certificate_downloads — hvem hentede hvad, hvornår. «Ny»-mærket i menuen
--      vises, når området er åbent og medlemmet ingen rækker har her. Én række
--      pr. hentning (design + format), skrevet af fladen EFTER en vellykket
--      download — fail-soft: en fejlet logning stopper aldrig filen.
--
-- RLS (permissive, stakker med OR — CLAUDE.md «RLS-mønstre»): medlemmet læser og
-- skriver KUN egne rækker (auth.uid() = user_id); rådgivere læser alle
-- (has_role(auth.uid(), 'advisor') — admin arver advisor). Ingen UPDATE/DELETE
-- for nogen klient: en hentning er sket, og sporet rettes ikke. Service role
-- går uden om RLS som altid.
--
-- STORAGE: portrættet genbruger den private bucket deling-portraetter
-- (20260914170000, signerede URL'er via src/lib/delingsbilleder.ts) — ingen ny
-- bucket. CORS målt 29/9-2026 med curl mod /storage/v1/object/sign/deling-portraetter/…
-- med Origin: https://app.theboardroom.dk → «access-control-allow-origin: *»
-- (også på OPTIONS-preflight). FØR-SELECT'en nedenfor måler, at bucketen findes.
--
-- FØR OG EFTER — samme forespørgsel, ÉT resultatsæt (Lovables editor eksporterer
-- kun det sidste resultatsæt):
--   SELECT 'kolonne certificate_eligible' AS sektion,
--          (SELECT count(*) FROM information_schema.columns
--            WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'certificate_eligible')::text AS svar
--   UNION ALL
--   SELECT 'tabel certificate_downloads', coalesce(to_regclass('public.certificate_downloads')::text, 'null')
--   UNION ALL
--   SELECT 'rls certificate_downloads', coalesce((SELECT relrowsecurity::text FROM pg_class WHERE relname = 'certificate_downloads' AND relnamespace = 'public'::regnamespace), 'null')
--   UNION ALL
--   SELECT 'policies certificate_downloads', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'certificate_downloads')::text
--   UNION ALL
--   SELECT 'policy-navne', coalesce((SELECT string_agg(policyname || ' [' || cmd || ']', ' · ' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'certificate_downloads'), '')
--   UNION ALL
--   SELECT 'bucket deling-portraetter', coalesce((SELECT 'findes, public=' || public::text FROM storage.buckets WHERE id = 'deling-portraetter'), 'MANGLER')
--   UNION ALL
--   SELECT 'virksomheder med flaget', coalesce((SELECT count(*) FILTER (WHERE certificate_eligible)::text FROM public.companies), 'kolonnen mangler');
--
-- FACIT FØR (forventet — Lovable-prod er IKKE målt fra CLI'en):
--   kolonne certificate_eligible | 0
--   tabel certificate_downloads  | null
--   rls certificate_downloads    | null
--   policies certificate_downloads | 0
--   policy-navne                 | (tom)
--   bucket deling-portraetter    | findes, public=false   (kørt 14/9 iflg. OVERLEVERING; filhovedet siger «SKREVET, IKKE KØRT» — mål den)
--   virksomheder med flaget      | (fejler med 42703 FØR — kør derfor FØR-SELECT'en uden den sidste linje, eller læs fejlen som «kolonnen mangler»)
-- FACIT EFTER:
--   kolonne certificate_eligible | 1
--   tabel certificate_downloads  | certificate_downloads
--   rls certificate_downloads    | true
--   policies certificate_downloads | 3
--   policy-navne                 | Medlemmet logger egen certifikat-hentning [INSERT] · Medlemmet læser egne certifikat-hentninger [SELECT] · Rådgivere læser alle certifikat-hentninger [SELECT]
--   bucket deling-portraetter    | findes, public=false
--   virksomheder med flaget      | 0   (indtil Jonas sætter flaget)
--
-- Frontend-målingen FØR Update (CLAUDE.md «Nye migrations»): med anon-nøglen fra
-- den udrullede bundle:
--   GET /rest/v1/companies?select=certificate_eligible&limit=0            → 200 (42703 = kolonnen mangler)
--   GET /rest/v1/certificate_downloads?select=id&limit=0                  → 200 (42P01 = tabellen mangler)
--
-- ROLLBACK:
--   drop table if exists public.certificate_downloads;
--   alter table public.companies drop column if exists certificate_eligible;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Flaget på virksomheden
-- ─────────────────────────────────────────────────────────────────────────
alter table public.companies
  add column if not exists certificate_eligible boolean not null default false;

comment on column public.companies.certificate_eligible is
  '«Dit certifikat» (29/9-2026): true for virksomheder, hvis medlemmer har fået 12-månederscertifikatet lovet (første hold). Sættes af Jonas i SQL. Området åbner 7 dage før contract_start_date + 12 måneder; NULL i contract_start_date = skjult.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Sporet over hentninger
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.certificate_downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  design text not null,
  format text not null check (format in ('pdf', 'png')),
  created_at timestamptz not null default now()
);

create index if not exists certificate_downloads_user_idx on public.certificate_downloads (user_id);

alter table public.certificate_downloads enable row level security;

comment on table public.certificate_downloads is
  '«Dit certifikat» (29/9-2026): én række pr. hentning (design + pdf/png), skrevet af fladen efter en vellykket download. Ingen rækker + åbent område = «Ny»-mærket i menuen. Medlemmet ser egne, rådgivere alle; ingen klient retter eller sletter.';

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'certificate_downloads' and policyname = 'Medlemmet læser egne certifikat-hentninger') then
    create policy "Medlemmet læser egne certifikat-hentninger"
      on public.certificate_downloads for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'certificate_downloads' and policyname = 'Medlemmet logger egen certifikat-hentning') then
    create policy "Medlemmet logger egen certifikat-hentning"
      on public.certificate_downloads for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'certificate_downloads' and policyname = 'Rådgivere læser alle certifikat-hentninger') then
    create policy "Rådgivere læser alle certifikat-hentninger"
      on public.certificate_downloads for select
      to authenticated
      using (public.has_role(auth.uid(), 'advisor'));
  end if;
end $$;
