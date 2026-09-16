-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- Momsen gemt pr. betaling i company_traek (16/9-2026, aften). Jonas: «Det
-- kunne altså være lidt fint, hvis priserne stod som ex. 40.000 kr. ex. moms
-- i stedet.» og «Priserne vi vil se er dem ex. moms.»
--
-- REGLEN: momsen gemmes PR. BETALING — koden antager aldrig 25 %. En
-- fremtidig kunde uden dansk moms (reverse charge, momsfri) må ikke vises
-- forkert. NULL = momsen er ikke kendt → fladerne viser beløbet «inkl.
-- moms» (aldrig et gæt); 0 = der er ingen moms på betalingen.
--
-- I DAG (20260903150000 + 20260917110000): beloeb_oere er fakturaens TOTAL
-- inkl. moms (stripe-webhook: invoice.total), betalt_oere det betalte inkl.
-- moms; e-conomic-rækkerne (kilde 'e-conomic') er også inkl. moms (Jonas
-- 16/9: Warburg år 1 50.000 = 40.000 ekskl. moms). Ingen kolonne bærer
-- momsen.
--
-- FORMEN:
--   moms_oere integer NULL
--   CHECK company_traek_moms_check (moms_oere is null or
--         (moms_oere >= 0 and moms_oere <= beloeb_oere))
--
-- SKRIVEREN: stripe-webhook sætter moms_oere fra Stripes Invoice-objekt
-- (_shared/abonnementstraek.ts momsFraFaktura: total_taxes[].amount summeret
-- i API-version 2025-03-31.basil+, ellers det ældre `tax`, ellers total −
-- total_excluding_tax; null når intet af det findes). De eksisterende
-- rækker får momsen ved backfill (~/Downloads/moms-backfill/, IKKE i repoet):
-- Stripe-rækker fra Stripes eksport (kolonnen Tax), e-conomic-rækker som
-- beloeb − round(beloeb / 1,25) på Jonas' udsagn.
--
-- LÆSERNE: lib/traek.beloebEksMoms(t) = beloeb_oere − moms_oere når momsen
-- er kendt; fladerne viser «3.500 kr. ekskl. moms», og «4.375 kr. inkl. moms»
-- når moms_oere er NULL. Ingen RLS ændres (kolonnen dækkes af de tre
-- eksisterende politikker på tabellen).
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 raekker' as sektion, 'i alt | pr. kilde' as noegle,
--          concat(count(*), ' | ', string_agg(concat(kilde, ':', n), ', ')) as vaerdi
--     from (select kilde, count(*) n from public.company_traek group by kilde) a
--   union all
--   select '2 kolonnen moms_oere', 'findes', count(*)::text
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'company_traek' and column_name = 'moms_oere'
--   union all
--   select '3 constraints', conname, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid = 'public.company_traek'::regclass
--   union all
--   select '4 beloeb', 'min | max | sum', concat(min(beloeb_oere), ' | ', max(beloeb_oere), ' | ', sum(beloeb_oere))
--     from public.company_traek
--   union all
--   select '5 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 2 = 0; sektion 3 uden company_traek_moms_check.
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt plus
--   select '6 moms', 'kendt | ukendt', concat(count(*) filter (where moms_oere is not null), ' | ', count(*) filter (where moms_oere is null))
--     from public.company_traek
--   FACIT EFTER: sektion 2 = 1; sektion 3 har company_traek_moms_check
--   «CHECK (((moms_oere IS NULL) OR ((moms_oere >= 0) AND (moms_oere <= beloeb_oere))))»;
--   sektion 1 og 4 uændrede; sektion 6 = «0 | N» (alle ukendte indtil backfill).
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK:
--   alter table public.company_traek drop constraint if exists company_traek_moms_check;
--   alter table public.company_traek drop column if exists moms_oere;

alter table public.company_traek
  add column if not exists moms_oere integer;

alter table public.company_traek
  drop constraint if exists company_traek_moms_check;

alter table public.company_traek
  add constraint company_traek_moms_check
  check (moms_oere is null or (moms_oere >= 0 and moms_oere <= beloeb_oere));

comment on column public.company_traek.moms_oere is
  'Momsen på betalingen i øre. NULL = ikke kendt (fladerne viser beløbet inkl. moms); 0 = ingen moms. Stripe: total_taxes[].amount (basil) / tax (ældre). Aldrig antaget 25 % i koden (16/9-2026).';

select
  count(*) as raekker,
  count(*) filter (where moms_oere is not null) as moms_kendt
from public.company_traek;
