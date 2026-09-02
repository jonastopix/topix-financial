-- Onboarding-tjeklisten: stemplet for «Se velkomsten».
-- KØRT MANUELT i Lovable SQL editor 2026-09-02. Denne fil er bogføringen,
-- så laget kan genskabes fra repoet.
--
-- Tjeklisten (src/lib/onboardingTjekliste.ts) krydser af på HANDLING, ikke
-- besøg. profiles.tour_completed_at måler kun første besøg på forsiden og
-- bruges bevidst ikke. Dette felt sættes af fladen når medlemmet trykker
-- «Kom i gang» i velkomst-overlejringen (HbOnboardingTjekliste), og
-- senere af HbVideoEmbeds onCompleted når videoen findes. Self-only RLS
-- på profiles dækker skrivningen.

alter table public.profiles
  add column if not exists velkomstvideo_set_at timestamptz;

comment on column public.profiles.velkomstvideo_set_at is
  'Onboarding-tjeklistens punkt 1: hvornår medlemmet så velkomsten. NULL = ikke set; overlejringen popper op første gang. Sættes af fladen (HbOnboardingTjekliste). IKKE det samme som tour_completed_at, som kun måler første besøg.';
