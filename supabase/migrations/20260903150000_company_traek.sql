-- Månedstrækkene registreres — vellykkede OG fejlede (docs/indgangen-design.md §31).
-- Skrevet 3/9; køres MANUELT i Lovable -> SQL editor efter merge
-- (CLAUDE.md — migrationer auto-deployer aldrig). Denne fil er bogføringen.
--
-- HVORFOR: målt 3/9 (recon-maanedstraek.md) er et fejlet træk fuldstændig
-- usynligt: Stripe sætter abonnementet i past_due, men webhooken springer
-- subscription-events over for alle medlemskabsabonnementer (#563), og
-- invoice.payment_failed er ikke tilmeldt. Medlemmet beholder adgang til
-- contract_end_date, rådgiveren ser en grøn badge, og kun Stripe Dashboard
-- ved besked. Besluttet 3/9 (Jonas): registrér ALLE træk, ikke kun de
-- fejlede — «tre af tolv betalt, fjerde fejlede» er en anden sætning end
-- «noget fejlede», og tretten abonnementer flyttes ind om ti dage.
--
-- EGEN TABEL, ikke rækker i company_perioder: company_perioder er
-- append-only historik over medlemsPERIODER (én række pr. kontraktår). En
-- rate er ikke en periode, og tolv rækker om året ville drukne
-- kontraktlinjerne. Denne tabel er ét spor pr. Stripe-faktura.
--
-- IDEMPOTENS: stripe_invoice_id er UNIQUE. Samme faktura giver aldrig to
-- rækker; et gensendt event, eller en betaling efter en fejl, OPDATERER
-- rækken (upsert på stripe_invoice_id). Status bærer det seneste kendte:
-- 'fejlet' → 'betalt' når Stripe (eller kortet) lykkes senere.
--
-- RØRER IKKE adgang/tier: computeMembershipTier læser ikke denne tabel.
-- Restancepolitikken (fornyelseskaeden §9) er besluttet, ikke bygget her.
--
-- RLS som company_perioder: rådgivere læser, service_role skriver.
-- Skriveren er stripe-webhook (Bucket C, service-role-klient).
--
-- Efter-verifikation:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'company_traek' ORDER BY ordinal_position;
--   SELECT policyname FROM pg_policies WHERE tablename = 'company_traek';

create table if not exists public.company_traek (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  stripe_subscription_id  text not null,
  stripe_invoice_id       text not null,
  stripe_customer_id      text,
  art                     text,
  periode_start           timestamptz,
  periode_slut            timestamptz,
  beloeb_oere             integer not null,
  betalt_oere             integer not null default 0,
  status                  text not null,
  betalt_at               timestamptz,
  fejlet_at               timestamptz,
  forsoeg                 integer,
  naeste_forsoeg_at       timestamptz,
  fejl_kode               text,
  fejl_decline_code       text,
  fejl_besked             text,
  billing_reason          text,
  faktura_nummer          text,
  hosted_invoice_url      text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint company_traek_invoice_unik unique (stripe_invoice_id),
  constraint company_traek_status_check check (status in ('betalt', 'fejlet')),
  constraint company_traek_beloeb_check check (beloeb_oere >= 0 and betalt_oere >= 0)
);

create index if not exists company_traek_company_idx
  on public.company_traek (company_id, periode_start desc);

create index if not exists company_traek_status_idx
  on public.company_traek (status) where status = 'fejlet';

comment on table public.company_traek is
  'Ét spor pr. Stripe-faktura på et abonnement: hvilken virksomhed, hvilket abonnement, hvilken faktura, hvornår, hvor meget, lykkedes det, og hvad Stripe sagde hvis ikke. Skrives KUN af stripe-webhook (invoice.paid og invoice.payment_failed). Rører ikke adgang: tier læses stadig af contract_end_date. Ikke en medlemsperiode — de bor i company_perioder.';

comment on column public.company_traek.company_id is
  'Fra abonnementets metadata.company_id (parent.subscription_details.metadata på fakturaen; ellers slået op på abonnementet). Alle husets abonnementer bærer den.';
comment on column public.company_traek.stripe_subscription_id is
  'Abonnementet fakturaen hører til (parent.subscription_details.subscription, ældre API: invoice.subscription).';
comment on column public.company_traek.stripe_invoice_id is
  'Fakturaen (in_…). UNIQUE — bærer idempotensen: samme faktura giver aldrig to rækker; senere events opdaterer.';
comment on column public.company_traek.art is
  'Abonnementets metadata.art: indgang, fornyelse, migreret — NULL for det art-løse selvbetjeningsabonnement. Kopieret fra abonnementet ved fakturaen, så rækken kan læses uden Stripe.';
comment on column public.company_traek.periode_start is
  'Fakturaens period_start — for subscription_cycle den måned raten dækker.';
comment on column public.company_traek.beloeb_oere is
  'Det opkrævede: fakturaens total INKL. moms (invoice.total). Bevidst anderledes end company_perioder.beloeb_oere (uden moms): dette er en BETALING, ikke en pris.';
comment on column public.company_traek.betalt_oere is
  'invoice.amount_paid — 0 så længe trækket er fejlet.';
comment on column public.company_traek.status is
  'betalt | fejlet — det seneste kendte. Et fejlet træk der lykkes senere, bliver betalt; fejl_*-felterne står som historik over den sidste fejl.';
comment on column public.company_traek.forsoeg is
  'invoice.attempt_count — hvor mange gange Stripe har forsøgt (Smart Retries tæller med).';
comment on column public.company_traek.naeste_forsoeg_at is
  'invoice.next_payment_attempt — hvornår Stripe prøver igen; NULL når der ikke kommer flere forsøg.';
comment on column public.company_traek.fejl_kode is
  'PaymentIntent.last_payment_error.code (fx card_declined) — kun ved fejlet.';
comment on column public.company_traek.fejl_decline_code is
  'PaymentIntent.last_payment_error.decline_code (kortudstederens grund, fx insufficient_funds) — kun ved fejlet og kun når udstederen gav en.';
comment on column public.company_traek.fejl_besked is
  'PaymentIntent.last_payment_error.message — Stripes læsbare tekst; kan vises til et menneske.';
comment on column public.company_traek.billing_reason is
  'invoice.billing_reason: subscription_cycle (månedstræk), subscription_create (første træk), subscription_update, manual …';

alter table public.company_traek enable row level security;

create policy "Advisors can view company traek"
  on public.company_traek for select to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role));

create policy "Service role can manage company traek"
  on public.company_traek for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);
