-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- KRÆVER 20260918200000_ansoegninger.sql (kørt i prod 18/9 kl. 10) og
-- 20260918210000_ansoegning_rykker_cron.sql (cronen) — ventelistens trappe
-- kører i A's kø.
--
-- VENTELISTEN (udkast 18/9-2026): et nej på NICHEN bliver til en plads i køen.
-- Jonas (ordret): «Faktisk snakker vi ikke om branche. Men om niche. De skal
-- decideret jagte samme kunder… Derfor er vi nødt til menneskeligt at vurdere
-- det hver gang.» Rådgiveren peger ved afvisningen på DEN KONKRETE VIRKSOMHED,
-- ansøgeren venter på — ikke en branche — med en linje om hvorfor.
--
-- HVORFOR EGEN TABEL og ikke et nyt trin på ansoegninger (målt 18/9):
--   1. ansoegninger_lukket_check er en biimplikation (trin='lukket' ⇔
--      lukkeaarsag is not null): en afvist ansøgning på venteliste er stadig
--      LUKKET med sin årsag — den skal ikke miste den.
--   2. ansoegninger_aaben_email_uidx regner alt andet end lukket/underskrevet
--      som åbent; et nyt åbent trin ville spærre for at søge igen på samme mail.
--   3. A's kildeværn (ansoegningMotor.guard dom 3) låser trin-listen i
--      20260918200000 byte-ens mod koden. Ventelisten rører hverken TRIN,
--      LUKKEAARSAGER eller triggeren protect_ansoegning_motor_fields.
--   En ansøger kan stå i FLERE køer (én række pr. (ansøgning, virksomhed)),
--   og forsvinder fra dem alle når de siger ja ét sted.
--
-- KØEN: første i køen får tilbuddet og 7 dage (trappen «venteplads» i
-- planlagte_haendelser: dag 0 tilbud, dag 3 rykker, dag 7 venteplads_udloeb).
-- Svarer de ikke, går tilbuddet videre til den næste — af sig selv. Det
-- FØRSTE tilbud trykker et menneske på (forsidelinjen). Anciennitet =
-- ansoegninger.lukket_at (hvornår de blev afvist), ellers sat_at.
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 tabel' as sektion, 'ventepladser' as noegle, count(*)::text as vaerdi
--     from information_schema.tables where table_schema='public' and table_name='ventepladser'
--   union all
--   select '2 trappe-check', conname, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid='public.planlagte_haendelser'::regclass and conname='planlagte_haendelser_trappe_check'
--   union all
--   select '3 handling-check', conname, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid='public.planlagte_haendelser'::regclass and conname='planlagte_haendelser_handling_check'
--   union all
--   select '4 rækker i køen', 'planlagte_haendelser', count(*)::text from public.planlagte_haendelser;
-- FACIT FØR: sektion 1 = 0; sektion 2 uden 'venteplads'; sektion 3 uden 'venteplads_udloeb'.
-- FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme fire plus
--   union all select '5 kolonner', 'ventepladser', count(*)::text from information_schema.columns where table_schema='public' and table_name='ventepladser'
--   union all select '6 politikker', 'ventepladser', count(*)::text from pg_policies where schemaname='public' and tablename='ventepladser'
--   union all select '7 indeks', 'ventepladser', count(*)::text from pg_indexes where schemaname='public' and tablename='ventepladser';
-- FACIT EFTER: sektion 1 = 1; sektion 2 med 'venteplads'; sektion 3 med 'venteplads_udloeb';
--   sektion 5 = 14 kolonner; sektion 6 = 2 politikker; sektion 7 = 5 indeks (pk + 4).
-- EFTER-CSV: (indsættes her)
--
-- ROLLBACK (ingen data i prod før flowet er tændt):
--   begin;
--   drop table if exists public.ventepladser;
--   alter table public.planlagte_haendelser drop constraint if exists planlagte_haendelser_trappe_check;
--   alter table public.planlagte_haendelser add constraint planlagte_haendelser_trappe_check
--     check (trappe in ('kladde','indkaldt','booket','aftalegrundlag','pause'));
--   alter table public.planlagte_haendelser drop constraint if exists planlagte_haendelser_handling_check;
--   alter table public.planlagte_haendelser add constraint planlagte_haendelser_handling_check
--     check (handling in ('send_mail','luk_svarer_ikke','udloeb','marker_afholdt','pause_slut'));
--   commit;
--   (Rollback forudsætter at ingen planlagte_haendelser-rækker har trappe='venteplads' —
--    ellers fejler CHECK'en; annullér dem først.)

begin;

-- ── 1. Tabellen ──────────────────────────────────────────────────────

create table if not exists public.ventepladser (
  id                  uuid primary key default gen_random_uuid(),
  ansoegning_id       uuid not null references public.ansoegninger(id) on delete cascade,
  -- Den konkrete virksomhed ansøgeren venter på (nichen). SET NULL ved
  -- sletning af virksomheden: rækken består som spor, køen er tom for den.
  company_id          uuid references public.companies(id) on delete set null,
  hvorfor             text,
  status              text not null default 'venter',
  sat_af              uuid references auth.users(id) on delete set null,
  sat_at              timestamptz not null default now(),
  tilbudt_at          timestamptz,
  tilbud_udloeber_at  timestamptz,
  tilbud_nr           integer not null default 0,
  svaret_at           timestamptz,
  afsluttet_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ventepladser_status_check
    check (status in ('venter', 'tilbudt', 'accepteret', 'udloebet', 'afslaaet', 'trukket')),
  constraint ventepladser_tilbud_check
    check ((status = 'tilbudt') = (tilbudt_at is not null and tilbud_udloeber_at is not null and afsluttet_at is null)),
  constraint ventepladser_afsluttet_check
    check ((status in ('accepteret', 'udloebet', 'afslaaet', 'trukket')) = (afsluttet_at is not null)),
  constraint ventepladser_hvorfor_laengde check (hvorfor is null or length(hvorfor) <= 500)
);

-- Én levende plads pr. (ansøgning, virksomhed). Afsluttede rækker bliver som spor.
create unique index if not exists ventepladser_levende_unik
  on public.ventepladser (ansoegning_id, company_id)
  where status in ('venter', 'tilbudt') and company_id is not null;

-- Højst ÉT tilbud ude pr. virksomhed ad gangen (køen går videre én ad gangen).
create unique index if not exists ventepladser_et_tilbud_pr_virksomhed
  on public.ventepladser (company_id)
  where status = 'tilbudt' and company_id is not null;

create index if not exists ventepladser_company_idx on public.ventepladser (company_id, status);
create index if not exists ventepladser_ansoegning_idx on public.ventepladser (ansoegning_id, status);

comment on table public.ventepladser is
  'Ventelisten: én række pr. (afvist ansøgning, virksomhed de venter på). Nichen er en konkret virksomhed, ikke en branche (Jonas 18/9). status: venter → tilbudt (7 dage, trappen venteplads i planlagte_haendelser) → accepteret | udloebet | afslaaet; trukket = sagde ja i en anden kø. Anciennitet = ansoegninger.lukket_at, ellers sat_at. Skrives KUN af venteliste-handling (rådgiver), ansoegning-link (ansøgerens svar) og ansoegning-rykker-cron (udløb → næste).';
comment on column public.ventepladser.company_id is
  'Den konkrete virksomhed hvis plads ansøgeren venter på. Pladsen er ledig når fornyelsesdommen siger tilbyd_ikke, udloebet_vindue_lukket (dag 15) eller ophoert — udledt, aldrig gemt.';
comment on column public.ventepladser.tilbud_nr is
  'Hvor mange gange tilbuddet er gået rundt i køen for denne virksomhed, da denne række fik det (1 = første). Til klokken og historikken.';

alter table public.ventepladser enable row level security;

create policy "Advisors can view ventepladser"
  on public.ventepladser for select to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role));
create policy "Service role can manage ventepladser"
  on public.ventepladser for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

drop trigger if exists ventepladser_updated_at on public.ventepladser;
create trigger ventepladser_updated_at
  before update on public.ventepladser
  for each row execute function public.update_updated_at_column();

-- ── 2. Trappen «venteplads» og handlingen «venteplads_udloeb» i A's kø ──
-- Navngivne CHECKs fra 20260918200000 (målt: constraint-navnene står
-- eksplicit dér). Udvides — ingen eksisterende værdi fjernes.

alter table public.planlagte_haendelser drop constraint if exists planlagte_haendelser_trappe_check;
alter table public.planlagte_haendelser add constraint planlagte_haendelser_trappe_check
  check (trappe in ('kladde', 'indkaldt', 'booket', 'aftalegrundlag', 'pause', 'venteplads'));

alter table public.planlagte_haendelser drop constraint if exists planlagte_haendelser_handling_check;
alter table public.planlagte_haendelser add constraint planlagte_haendelser_handling_check
  check (handling in ('send_mail', 'luk_svarer_ikke', 'udloeb', 'marker_afholdt', 'pause_slut', 'venteplads_udloeb'));

commit;

-- Selv-facit
select
  (select count(*) from information_schema.tables where table_schema='public' and table_name='ventepladser') as tabel,
  (select count(*) from pg_policies where schemaname='public' and tablename='ventepladser') as politikker,
  (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.planlagte_haendelser'::regclass and conname='planlagte_haendelser_trappe_check') as trappe_check;
