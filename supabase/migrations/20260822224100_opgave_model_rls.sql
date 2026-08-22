-- Opgave-model, fase 1, spor 2: RLS strammes til skrivning kun via edge functions.
-- Design: docs/opgave-model-design.md (beslutning A, 2026-08-22).
--
-- Baggrund: de eksisterende politikker gav baade medlemmer og raadgivere
-- INSERT og UPDATE paa hele deres scope. Medlemmets UPDATE havde ingen
-- with_check og faldt tilbage paa qual, saa et medlem kunne skrive hvad
-- som helst i egne raekker — herunder saette deferral_count til nul,
-- flytte expires_at eller markere en opgave som gjort uden at have gjort
-- den. Motoren (src/lib/opgaveEngine.ts) haandhaever reglerne, men den
-- koerer i browseren og kan derfor omgaas.
--
-- Efter dette greb sker al skrivning gennem edge functions med service
-- role, saa opgaveEngine er den ene sandhed for tilstandsovergange.
--
-- Roerer INGEN eksisterende funktionalitet:
--   - Ingen levende flade skriver til company_actions. Eneste mutation laa
--     i doed kode (DashboardActionCenter.tsx:321,335). Verificeret i
--     docs/opgave-model-kortlaegning.md §2.
--   - generate-weekly-focus og run-company-agent skriver begge via
--     SUPABASE_SERVICE_ROLE_KEY (generate-weekly-focus/index.ts:27,60;
--     run-company-agent/index.ts:992,995). Service role omgaar RLS.
--
-- SELECT bevares for begge roller. Raadgiverens SELECT er forudsaetningen
-- for B8, hvor ubesvarede forslag skal taelles paa raadgiversiden.
--
-- Koert manuelt i Lovable SQL editor 2026-08-22 22:41. Verificeret ved
-- pg_policies-udtraek: tre politikker tilbage (service role ALL, to SELECT).

drop policy if exists "Members can insert own company actions" on public.company_actions;
drop policy if exists "Members can update own company actions" on public.company_actions;
drop policy if exists "Advisors can insert all company actions" on public.company_actions;
drop policy if exists "Advisors can update all company actions" on public.company_actions;

comment on table public.company_actions is
  'Opgave-modellen (docs/opgave-model-design.md). Skrivning sker UDELUKKENDE gennem edge functions med service role, saa opgaveEngine er den ene sandhed for tilstandsovergange (beslutning A, 2026-08-22). Klienter har kun SELECT. Tilfoej aldrig INSERT- eller UPDATE-politikker for authenticated uden at flytte reglerne med.';
