-- Fornyelsens vinduesstempler: hvad har vi allerede sendt EFTER slutdatoen?
-- KOERES MANUELT i Lovable -> SQL editor (CLAUDE.md: db push virker ikke).
-- Denne fil er bogfoeringen, saa laget kan genskabes fra repoet.
--
-- BAGGRUND (15/9-2026, PR 3). Jonas 15/9, ordret: «De skal have en til to
-- mails i deres periode, hvor de bliver minde om, at det vil vaere deres
-- sidste chance eller hvis de gerne vil forlaenge, saa er det en mulighed,
-- selvfoelgelig kun hvis vi har tilbudt dem forlaengelse.» Valg A: to mails
-- i forlaengelsesvinduet -- dag 1 («udloebet, du kan stadig forlaenge til og
-- med {dato}») og dag 11 («sidste chance, tilbuddet lukker {dato}») -- KUN
-- ved beslutning «tilbyd». Vinduet er dag 0-14 efter slutdato
-- (FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE, fornyelse.ts). Foer 15/9 sendte
-- fornyelsesvarsel-cron intet efter slutdatoen (gren 4 i
-- fornyelsesvarsel.ts): medlemmet fik kun tilbuddet i gaten, ingen mail.
--
-- Formen spejler varselsstemplerne (20260907090000): pg_cron -> edge
-- function med TOERKOERSEL SOM STANDARD -> ren motor afgoer hvad der er
-- forfaldent -> byg mail -> send -> STEMPL KUN naar afsendelsen lykkedes.
--
-- HVORFOR TO NAVNGIVNE KOLONNER (samme grund som 20260907090000): der er
-- praecis to mails med hvert sit indhold, og de kan sendes uafhaengigt.
-- Opdages et medlem foerst paa dag 12 (mistet cron-dag), skal vindue 2
-- kunne gaa uden at vindue 1 nogensinde er sendt (chattens C1: dag >= 11
-- uden vindue 1 -> KUN vindue 2). Et dag-nummer kan ikke udtrykke det.
--
-- KONSEKVENS 1: ingen trigger paa tabellen (uaendret) -- cron'en saetter
-- selv updated_at. KONSEKVENS 2: fjernes beslutningen, slettes raekken og
-- stemplerne foelger med; saettes «tilbyd» igen, sendes vinduesmailene
-- forfra. KONSEKVENS 3: stemplerne er absolutte -- flyttes slutdatoen,
-- regnes dagene forfra, men en sendt vinduesmail gentages ikke.
-- KONSEKVENS 4: dag 15 og senere er udloebet_vindue_lukket -> intet,
-- uanset stempler.
--
-- BEVIS, foer og efter:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'company_fornyelse'
--     AND column_name IN ('vindue_1_sendt_at', 'vindue_2_sendt_at');

alter table public.company_fornyelse
  add column if not exists vindue_1_sendt_at timestamptz,
  add column if not exists vindue_2_sendt_at timestamptz;

comment on column public.company_fornyelse.vindue_1_sendt_at is
  'Naar vinduesmail 1 (dag 1-10 efter slutdato: «udloebet, du kan stadig forlaenge til og med {dato}») faktisk blev sendt. NULL = ikke sendt. Saettes KUN naar afsendelsen lykkedes; fejler stemplet, gaar mailen igen naeste dag - hellere en dublet end tavshed. Kun ved beslutning tilbyd og tilstanden udloebet_tilbyd.';

comment on column public.company_fornyelse.vindue_2_sendt_at is
  'Naar vinduesmail 2 (dag 11-14 efter slutdato: «sidste chance, tilbuddet lukker {dato}») faktisk blev sendt. NULL = ikke sendt. Uafhaengigt af vindue 1: opdages medlemmet foerst paa dag 11 eller senere, sendes kun vindue 2.';
