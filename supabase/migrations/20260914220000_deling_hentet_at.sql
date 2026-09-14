-- Onboarding-tjeklisten: stemplet for «Fortæl det videre» (delingens del 2, 14/9-2026).
-- KØRES MANUELT i Lovable → SQL editor (CLAUDE.md: db push virker ikke).
-- Denne fil er bogføringen, så laget kan genskabes fra repoet.
--
-- HVORFOR: /deling med tolv kreativer og «Hent PNG» er i drift (#866-#884),
-- men et nyt medlem fandt den ikke af sig selv — linket skulle sendes i
-- hånden til hver af de 10-15 der importeres 22/9. Tjeklisten
-- (src/lib/onboardingTjekliste.ts) får punktet «Fortæl det videre» sidst,
-- som menupunktet står sidst. Tjeklisten krydser af på HANDLING, ikke
-- besøg: dette felt sættes af KreativFuldskaerm (useDelingHentet) første
-- gang en PNG faktisk er hentet — et besøg på /deling tæller ikke.
-- Self-only RLS på profiles dækker skrivningen (samme som velkomstvideo_set_at,
-- 20260902170000). KUN NYE MEDLEMMER ser punktet (profiles.created_at >=
-- DELING_PUNKT_FRA i motoren) — kolonnen er NULL for alle eksisterende, og
-- det åbner ikke deres liste igen.

alter table public.profiles
  add column if not exists deling_hentet_at timestamptz;

comment on column public.profiles.deling_hentet_at is
  'Onboarding-tjeklistens punkt 8 «Fortæl det videre» (14/9-2026): første gang medlemmet hentede en PNG på /deling. NULL = ikke hentet. Sættes af fladen (KreativFuldskaerm → useDelingHentet), kun når tom. Et besøg på siden tæller ikke.';
