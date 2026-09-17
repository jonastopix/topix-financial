-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- Kontrakterne: én række pr. KONTRAKTÅR med prisen ekskl. moms — kilden
-- til det økonomiske overblik for Jonas og Morten (Ø1, 18/9-2026,
-- recon-oekonomi-dashboard.md §10.1). Jonas 17/9 (ordret): «Bemærk, at
-- alle medlemskaber, også dem der betaler fuld pris med det samme, skal
-- periodiseres over 12 mdr. så omsætningen er retvisende.»
--
-- HVORFOR EN NY TABEL og ikke company_perioder (MÅL FØRST, README §1):
-- company_perioder (20260901140000) bærer en pris (beloeb_oere ekskl.
-- moms) og perioden, men den er stripe-webhookens BILAG og idempotens-
-- nøgle (stripe_reference), værnet mod dobbeltbetaling læser den
-- (_shared/fornyelsesVaern.ts: «findes der allerede en periode … hvis
-- periode_slut ligger EFTER den nye start»), «siden sidst» viser nye rækker
-- som betalinger (20260909100000 :94), og medlemmets Aftalen viser rækkerne
-- (IndstillingerView :203). 33 backfill-rækker dér ville ændre tre
-- flader og ét værn. Dens CHECKs kender heller ikke maanedlig, e-conomic
-- og gratis, og art kender ikke manuel/backfill. Kontrakterne er et
-- REGNSKABSLAG: ingen edge function læser dem, ingen flade for medlemmet.
-- company_perioder-rækken peges der på (periode_id), så indgang og
-- fornyelse kan spejles én til én (Ø1c: webhooken skriver begge).
--
-- FORMEN:
--   company_id           → companies (cascade)
--   periode_start/slut   date; slut EKSKLUSIV som overalt i huset
--   grundpris_oere       listeprisen (grundlag for 50 %-reglen — samme
--                        semantik som companies.indgangspris_oere)
--   pris_eks_moms_oere   det der faktisk er faktureret for perioden inkl. 5 %
--                        ratetillæg (samme semantik som company_perioder.
--                        beloeb_oere) — DET tal periodiseres. Jonas 17/9
--                        (ordret): «Prisen er det, der faktisk er faktureret.
--                        Grundprisen er det, fornyelsen regner fra.»
--   betalingsmodel       fuld · rate2 · rate12 · maanedlig · e-conomic · gratis
--   kilde                indgang · fornyelse · manuel · backfill
--   periode_id           → company_perioder (set null) — bilaget når det findes
--   note                 fri tekst (Jonas' rettelser 16/9 står ordret her)
--   UNIQUE (company_id, periode_start): to kontraktår starter aldrig samme dag.
--   Overlap mellem to kontraktår hos samme virksomhed er LOVLIGT (Warburg
--   16/6 → 26/6) og værnes ikke med EXCLUDE — btree_gist er ikke aktiveret
--   (grep migrations: kun pg_cron og pg_net), og et overlap er en
--   oplysning, ikke en fejl. EFTER-SQL'en viser dem.
--
-- RLS: rådgivere LÆSER (has_role advisor — admin arver); kun service_role
-- skriver (backfill i SQL editor, senere webhooken). Ingen INSERT-politik
-- for rådgivere (modsat company_perioder), ingen SECURITY DEFINER, ingen
-- partner-rolle her — den kommer i Ø2 med RPC'en der afleverer rækkerne.
-- Medlemmet ser ikke tabellen (ingen politik = ingen adgang).
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 tabellen' as sektion, 'findes' as noegle, count(*)::text as vaerdi
--     from information_schema.tables where table_schema = 'public' and table_name = 'kontrakter'
--   union all
--   select '2 company_perioder', 'raekker | art', concat(count(*), ' | ', string_agg(concat(art, ':', n), ', '))
--     from (select art, count(*) n from public.company_perioder group by art) a
--   union all
--   select '3 btree_gist', 'aktiveret', count(*)::text from pg_extension where extname = 'btree_gist'
--   union all
--   select '4 aktive kunder', 'antal', count(*)::text from public.companies where status = 'active' and er_kunde
--   union all
--   select '5 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 = 0; sektion 4 = 29 (16/9) — afviger det, er backfillens liste forældet: STOP.
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt plus
--   select '6 kolonner', column_name, concat(data_type, ' | ', is_nullable) from information_schema.columns
--    where table_schema = 'public' and table_name = 'kontrakter'
--   union all
--   select '7 politikker', policyname, concat(cmd, ' | ', roles::text) from pg_policies
--    where schemaname = 'public' and tablename = 'kontrakter'
--   union all
--   select '8 raekker', 'antal', count(*)::text from public.kontrakter
--   FACIT EFTER: sektion 1 = 1; sektion 6 = 11 kolonner; sektion 7 = 2 politikker
--   («Advisors can view kontrakter» SELECT {authenticated}, «Service role can
--   manage kontrakter» ALL {public}); sektion 8 = 0 (backfillen er en egen kørsel).
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK:
--   drop table if exists public.kontrakter;

create table if not exists public.kontrakter (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  periode_start       date not null,
  periode_slut        date not null,
  grundpris_oere      integer not null,
  pris_eks_moms_oere  integer not null,
  betalingsmodel      text not null,
  kilde               text not null,
  periode_id          uuid references public.company_perioder(id) on delete set null,
  note                text,
  created_at          timestamptz not null default now(),
  constraint kontrakter_slut_efter_start check (periode_slut > periode_start),
  constraint kontrakter_pris_check check (grundpris_oere >= 0 and pris_eks_moms_oere >= 0),
  constraint kontrakter_gratis_check check (betalingsmodel <> 'gratis' or pris_eks_moms_oere = 0),
  constraint kontrakter_betalingsmodel_check check (betalingsmodel in ('fuld', 'rate2', 'rate12', 'maanedlig', 'e-conomic', 'gratis')),
  constraint kontrakter_kilde_check check (kilde in ('indgang', 'fornyelse', 'manuel', 'backfill')),
  constraint kontrakter_company_start_unik unique (company_id, periode_start)
);

create index if not exists kontrakter_company_slut_idx
  on public.kontrakter (company_id, periode_slut desc);

create index if not exists kontrakter_periode_idx
  on public.kontrakter (periode_start, periode_slut);

comment on table public.kontrakter is
  'Én række pr. kontraktår med prisen ekskl. moms — kilden til periodiseret omsætning (pris/12 pr. måned, dansk kalender). Regnskabslag: ingen edge function læser den, medlemmet ser den ikke. company_perioder er stadig webhookens bilag; periode_id peger derhen. Skrives af service role (backfill, senere stripe-webhook). 18/9-2026.';
comment on column public.kontrakter.periode_slut is
  'EKSKLUSIV: adgangen og perioden slutter kl. 00:00 på selve dagen (som contract_end_date og company_perioder).';
comment on column public.kontrakter.grundpris_oere is
  'Jonas 17/9-2026 (ordret): «Prisen er det, der faktisk er faktureret. Grundprisen er det, fornyelsen regner fra.» Grundprisen i øre ekskl. moms — grundlag for 50 %-reglen (samme semantik som companies.indgangspris_oere). Ratetillæg indgår ikke.';
comment on column public.kontrakter.pris_eks_moms_oere is
  'Jonas 17/9-2026 (ordret): «Prisen er det, der faktisk er faktureret. Grundprisen er det, fornyelsen regner fra.» Det der faktisk er faktureret for perioden i øre ekskl. moms, inkl. 5 % ratetillæg (samme semantik som company_perioder.beloeb_oere). DET tal periodiseres. 0 for gratis.';
comment on column public.kontrakter.betalingsmodel is
  'fuld | rate2 | rate12 | maanedlig | e-conomic | gratis — hvordan perioden betales; ændrer ikke periodiseringen.';
comment on column public.kontrakter.kilde is
  'indgang | fornyelse (spejl af company_perioder) | manuel (rådgiver i SQL) | backfill (Ø1, 18/9-2026 med Jonas'' rettelser 16/9).';

alter table public.kontrakter enable row level security;

drop policy if exists "Advisors can view kontrakter" on public.kontrakter;
create policy "Advisors can view kontrakter"
  on public.kontrakter for select to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role));

drop policy if exists "Service role can manage kontrakter" on public.kontrakter;
create policy "Service role can manage kontrakter"
  on public.kontrakter for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'kontrakter') as tabellen_findes,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kontrakter') as politikker,
  (select count(*) from public.kontrakter) as raekker;
