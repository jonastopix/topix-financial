-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- Betalinger uden for Stripe-abonnementer i company_traek (16/9-2026, aften;
-- Jonas: «Jeg vil hellere vi får styr på det i aften, inden bogføring.»).
-- Chattens form: ÉN betalingsliste pr. virksomhed — company_traek udvides
-- med en KILDE, og de to Stripe-nøgler bliver nullable, så engangsbetalinger
-- i Stripe (uden abonnement) og betalte e-conomic-fakturaer kan stå ved
-- siden af abonnementstrækkene.
--
-- I DAG (20260903150000): stripe_subscription_id og stripe_invoice_id er
-- NOT NULL; stripe_invoice_id er UNIQUE (company_traek_invoice_unik) og
-- bærer idempotensen i stripe-webhook (upsert onConflict). 177 rækker i prod
-- (16/9 aften): abonnementstræk fra webhooken + 174 historik-rækker fra den
-- gamle konto (art = 'historik_topix') — ALLE med begge Stripe-id'er.
--
-- FORMEN:
--   kilde text NOT NULL DEFAULT 'stripe_abonnement'
--       CHECK (kilde IN ('stripe_abonnement','stripe_engang','e-conomic'))
--   stripe_subscription_id, stripe_invoice_id → NULLABLE
--   CHECK company_traek_kilde_noegler:
--       stripe_abonnement → begge Stripe-id'er sat
--       stripe_engang     → stripe_invoice_id sat (abonnementet er NULL)
--       e-conomic         → faktura_nummer sat (e-conomic-nummeret), ingen Stripe-id'er
--   UNIQUE på stripe_invoice_id BEVARES (Postgres: flere NULL er tilladt).
--   Delvist UNIQUE-indeks (kilde, faktura_nummer) WHERE kilde = 'e-conomic'
--   — samme e-conomic-faktura kan ikke indsættes to gange.
--
-- DEFAULT'en giver de 177 eksisterende rækker kilde 'stripe_abonnement' —
-- og CHECK'en holder for dem, fordi de alle har begge id'er (FØR-SQL'ens
-- sektion 2 SKAL vise 0 rækker uden et af id'erne; ellers STOP).
--
-- KLIENTERNE: stripe-webhook skriver fortsat UDEN kilde (DEFAULT) og med
-- begge id'er — ingen edge function ændres. Læserne (useVirksomhed,
-- IndstillingerView, VirksomhedslisteView) læser id og kilde og viser
-- kilden gennem lib/traek.traekLabel; nøglen i React er rækkens id, ikke
-- stripe_invoice_id (som nu kan være NULL). Ingen RLS ændres: de tre
-- politikker (advisor SELECT, service role ALL, medlem SELECT på egen
-- virksomhed, 20260909120000) dækker de nye rækker som de gamle.
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 raekker' as sektion, 'i alt | pr. art' as noegle,
--          concat(count(*), ' | ', string_agg(concat(coalesce(art,'-'), ':', n), ', ')) as vaerdi
--     from (select art, count(*) n from public.company_traek group by art) a
--   union all
--   select '2 noegler', 'uden subscription_id | uden invoice_id | uden faktura_nummer',
--          concat(count(*) filter (where stripe_subscription_id is null), ' | ',
--                 count(*) filter (where stripe_invoice_id is null), ' | ',
--                 count(*) filter (where faktura_nummer is null))
--     from public.company_traek
--   union all
--   select '3 constraints', conname, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid = 'public.company_traek'::regclass
--   union all
--   select '4 indeks', indexname, indexdef
--     from pg_indexes where schemaname = 'public' and tablename = 'company_traek'
--   union all
--   select '5 kolonnen kilde', 'findes', count(*)::text
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'company_traek' and column_name = 'kilde'
--   union all
--   select '6 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 2 = «0 | 0 | N» (N = rækker uden fakturanummer — tilladt);
--   sektion 5 = 0; sektion 3 uden company_traek_kilde_*; sektion 4 uden
--   company_traek_econ_faktura_unik.
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt. FACIT EFTER: sektion 5 = 1; sektion 3 har
--   company_traek_kilde_check og company_traek_kilde_noegler; sektion 4 har
--   company_traek_econ_faktura_unik; sektion 1 uændret (177 rækker); sektion 2
--   uændret (0 | 0 | N); «select kilde, count(*) from public.company_traek
--   group by 1» = stripe_abonnement 177.
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK (data røres ikke; rækker med kilde <> 'stripe_abonnement' skal
-- slettes FØRST — ~/Downloads/betalinger-uden-stripe/04-rollback.sql — ellers
-- fejler SET NOT NULL):
--   drop index if exists public.company_traek_econ_faktura_unik;
--   alter table public.company_traek drop constraint if exists company_traek_kilde_noegler;
--   alter table public.company_traek drop constraint if exists company_traek_kilde_check;
--   alter table public.company_traek drop column if exists kilde;
--   alter table public.company_traek alter column stripe_subscription_id set not null;
--   alter table public.company_traek alter column stripe_invoice_id set not null;

-- ── 0. Værn: ingen eksisterende række må bryde den kommende CHECK ──
do $$
declare n integer;
begin
  select count(*) into n from public.company_traek
   where stripe_subscription_id is null or stripe_invoice_id is null;
  if n > 0 then
    raise exception 'company_traek: % raekker mangler et Stripe-id — STOP, CHECK''en ville fejle', n;
  end if;
end $$;

-- ── 1. Kilden ──
alter table public.company_traek
  add column if not exists kilde text not null default 'stripe_abonnement';

alter table public.company_traek
  drop constraint if exists company_traek_kilde_check;
alter table public.company_traek
  add constraint company_traek_kilde_check
  check (kilde in ('stripe_abonnement', 'stripe_engang', 'e-conomic'));

comment on column public.company_traek.kilde is
  'Hvor betalingen kommer fra: stripe_abonnement (webhooken, begge Stripe-id''er), stripe_engang (Stripe-faktura uden abonnement, kun stripe_invoice_id), e-conomic (betalt e-conomic-faktura, faktura_nummer = e-conomic-nummeret, ingen Stripe-id''er). Tilføjet 16/9-2026.';

-- ── 2. Stripe-nøglerne bliver nullable; kilden afgør hvad der kræves ──
alter table public.company_traek alter column stripe_subscription_id drop not null;
alter table public.company_traek alter column stripe_invoice_id drop not null;

alter table public.company_traek
  drop constraint if exists company_traek_kilde_noegler;
alter table public.company_traek
  add constraint company_traek_kilde_noegler
  check (
    (kilde = 'stripe_abonnement' and stripe_subscription_id is not null and stripe_invoice_id is not null)
    or (kilde = 'stripe_engang' and stripe_invoice_id is not null and stripe_subscription_id is null)
    or (kilde = 'e-conomic' and faktura_nummer is not null and stripe_invoice_id is null and stripe_subscription_id is null)
  );

-- ── 3. Én række pr. e-conomic-faktura ──
create unique index if not exists company_traek_econ_faktura_unik
  on public.company_traek (kilde, faktura_nummer)
  where kilde = 'e-conomic';

comment on table public.company_traek is
  'Én betalingsliste pr. virksomhed (16/9-2026): abonnementstræk fra Stripe (kilde stripe_abonnement — ét spor pr. faktura, skrevet KUN af stripe-webhook, UNIQUE stripe_invoice_id bærer idempotensen), engangsbetalinger i Stripe (stripe_engang) og betalte e-conomic-fakturaer (e-conomic) — de to sidste indsat i hånden med værnet SQL. status betalt | fejlet; beloeb_oere inkl. moms.';

-- ── 4. Efter-verifikation ──
select kilde, count(*) from public.company_traek group by 1 order by 1;
