-- Fornyelsens varselsstempler: hvad har vi allerede sendt?
--
-- BAGGRUND (7/9-2026). Fornyelsesordningen har INGEN afsender: ingen
-- mail, ingen skabelon, ingen cron (maalt 6/9,
-- recon-fornyelsen-10-september.md). Medlemmet hoerer foerst om sin
-- fornyelse ved at MISTE adgangen og selv opdage tilbuddet i gaten.
-- Besluttet 6/9: systemet skal sende. To varsler foer slutdato --
-- varsel 1 ved 30 dage foer, varsel 2 ved 7 dage foer -- og en
-- notifikation til raadgiveren naar varsel 1 er gaaet, saa den
-- personlige besked kommer EFTER systemets mail og ikke i stedet for.
--
-- Formen spejler indgangens kaede (recon-indgangens-mailkaede.md):
-- pg_cron -> net.http_post med vault-noeglen -> edge function med
-- TOERKOERSEL SOM STANDARD -> ren motor afgoer hvad der er forfaldent
-- -> byg mail -> enqueue -> STEMPL KUN naar afsendelsen lykkedes.
--
-- HVORFOR TO NAVNGIVNE KOLONNER og ikke et dag-nummer som
-- company_betalingslink.sidste_paamindelse_dag: der er praecis to
-- varsler med hvert sit indhold, og de kan sendes uafhaengigt.
-- Traeffes beslutningen foerst 10 dage foer slutdato, skal varsel 2
-- kunne gaa uden at varsel 1 nogensinde er sendt. Et dag-nummer kan
-- ikke udtrykke det uden at lyve.
--
-- KONSEKVENS 1: der er INGEN trigger paa denne tabel (bevidst, se
-- 20260811120000, maalt i prod 7/9: tgisinternal-fri liste er tom).
-- Skrivestien saetter selv updated_at. Det gaelder ogsaa cron'en.
-- KONSEKVENS 2: fjernes beslutningen i FornyelsesSektion, SLETTES
-- raekken, og stemplerne foelger med. Saettes beslutningen igen, sendes
-- varslerne forfra. Det er tilsigtet -- at fjerne og gentilfoeje er en
-- bevidst nulstilling -- men det betyder at et medlem kan faa varsel 1
-- to gange, hvis en beslutning trykkes vaek og tilbage.
-- KONSEKVENS 3: stemplerne er absolutte. Flyttes contract_end_date
-- efter et varsel er sendt, regnes dagtallet forfra, men et sendt
-- varsel bliver staaende som sendt og gentages ikke.

alter table public.company_fornyelse
  add column if not exists varsel_1_sendt_at timestamptz,
  add column if not exists varsel_2_sendt_at timestamptz;

comment on column public.company_fornyelse.varsel_1_sendt_at is
  'Naar foerste fornyelsesvarsel (30 dage foer slutdato) faktisk blev sendt. NULL = ikke sendt. Saettes KUN naar afsendelsen lykkedes; fejler stemplet, gaar mailen igen naeste dag - hellere en dublet end tavshed.';

comment on column public.company_fornyelse.varsel_2_sendt_at is
  'Naar andet fornyelsesvarsel (7 dage foer slutdato) faktisk blev sendt. NULL = ikke sendt. Uafhaengigt af varsel 1: en sen beslutning kan give varsel 2 uden varsel 1.';

-- Service-rollen skriver stemplerne fra cron'en. Supabases service_role
-- har BYPASSRLS, saa policyen er ikke noedvendig for at det virker --
-- men husets standard er at skrive hensigten frem (samme som
-- company_betalingslink, 20260902080000), saa adgangen kan laeses i
-- pg_policy og ikke kun udledes af en rolleegenskab.
drop policy if exists "Service role can manage company fornyelse" on public.company_fornyelse;
create policy "Service role can manage company fornyelse"
  on public.company_fornyelse
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
