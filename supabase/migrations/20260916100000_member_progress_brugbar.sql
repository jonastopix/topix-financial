-- Video-rating med et tryk i Akademiet: «Kunne du bruge den?» paa member_progress.
-- KOERES MANUELT i Lovable -> SQL editor (CLAUDE.md: db push virker ikke).
-- Denne fil er bogfoeringen, saa laget kan genskabes fra repoet.
--
-- BAGGRUND (16/9-2026, motoren; recon ~/Downloads/recon-video-rating.md).
-- Mangellistens punkt (4): femten nye ser lektionerne i deres foerste uge,
-- og i dag vides ikke hvilke af de tretten kurser der virker. Besluttet
-- 11/9 (staaende uden indsigelse): INGEN ny tabel. To kolonner paa
-- member_progress, saa svaret foelger den raekke der allerede baerer
-- «set faerdig» (acknowledged_at), dens UNIQUE(user_id, content_item_id),
-- dens RLS og dens kaskader. Spoerges naar acknowledged_at saettes;
-- tallet pr. lektion til raadgiverne. Spoergsmaalets tekst, «Kunne du
-- bruge den?» (ja/nej), og kolonnenavnene brugbar/brugbar_at er Jonas'
-- beslutning 16/9: tingene hedder det de er. UI og laesere kommer i en
-- senere omgang -- denne migration er kun kolonnerne.
--
-- HVORFOR TO KOLONNER: brugbar er svaret (true/false), null er «ikke
-- besvaret» -- det er dommen for om der skal spoerges. brugbar_at er
-- tidspunktet, saa et svar kan skelnes fra en senere rettelse uden at
-- laene sig op ad updated_at, som ogsaa flytter ved position og fortryd.
--
-- KONSEKVENS 1: de fem eksisterende policies gaelder uaendret (20260804120000
-- + 20260805200000): medlemmet skriver kun egne raekker (auth.uid() =
-- user_id); raadgiverens UPDATE-policy kan teknisk skrive kolonnen, men
-- ingen flade goer det. KONSEKVENS 2: kaskaden fra auth.users og fra
-- content_items (ON DELETE CASCADE, 20260804120000:245-246) er uaendret --
-- svaret doer med kontoen og med lektionen, som resten af raekken.
-- KONSEKVENS 3: ingen eksisterende laeser vaelger kolonnerne ved navn
-- (recon afsnit 2: getMyProgress bruger select("*"), listAllMemberProgress
-- og run-company-agent navngiver kun de gamle kolonner) -- intet aendrer
-- adfaerd foer en laeser beder om dem. KONSEKVENS 4: acknowledged_at er
-- kildeloes (baseline, addendum 2026-08-05) -- en raadgivermarkeret
-- lektion vil derfor ogsaa blive spurgt; det er bevidst, motoren
-- (lektionBrugbar.ts) taeller aldrig raadgiverens egne raekker.
--
-- BEVIS, foer og efter (0 raekker foer, 2 efter):
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'member_progress'
--     AND column_name IN ('brugbar', 'brugbar_at');

alter table public.member_progress
  add column if not exists brugbar boolean,
  add column if not exists brugbar_at timestamptz;

comment on column public.member_progress.brugbar is
  'Medlemmets svar paa «Kunne du bruge den?» -- true = ja, false = nej. NULL = ikke besvaret (der spoerges naar lektionen er set faerdig, acknowledged_at sat, og kun paa tracked videoer). Svaret bliver staaende hvis kvitteringen fortrydes; motoren taeller det kun naar acknowledged_at er sat.';

comment on column public.member_progress.brugbar_at is
  'Hvornaar svaret paa «Kunne du bruge den?» blev givet. NULL = ikke besvaret. Saettes sammen med brugbar, aldrig alene.';
