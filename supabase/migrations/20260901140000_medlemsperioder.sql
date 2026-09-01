-- Prisgrundlag på companies + append-only historik over medlemsperioder.
-- KØRT MANUELT i Lovable SQL editor 2026-09-01. Denne fil er bogføringen,
-- så laget kan genskabes fra repoet.

alter table public.companies
  add column if not exists indgangspris_oere   integer,
  add column if not exists fornyelsespris_oere integer;

comment on column public.companies.indgangspris_oere is
  'Listeprisen virksomheden kom ind på, i øre. Grundlag for 50 %-reglen. IKKE det betalte beløb — ratetillæg på 5 % indgår ikke.';
comment on column public.companies.fornyelsespris_oere is
  'Kun udfyldt ved bevidst afvigelse fra 50 %-reglen. NULL = beregnes som halvdelen af indgangspris_oere.';

create table if not exists public.company_perioder (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  periode_start   date not null,
  periode_slut    date not null,
  beloeb_oere     integer not null,
  betalingsmodel  text not null,
  art             text not null,
  stripe_reference text,
  oprettet_af     uuid references auth.users(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now(),
  constraint company_perioder_slut_efter_start check (periode_slut > periode_start),
  constraint company_perioder_betalingsmodel_check check (betalingsmodel in ('fuld','rate2','rate12','faktura')),
  constraint company_perioder_art_check check (art in ('indgang','fornyelse')),
  constraint company_perioder_beloeb_positivt check (beloeb_oere >= 0)
);

create index if not exists company_perioder_company_slut_idx
  on public.company_perioder (company_id, periode_slut desc);

comment on table public.company_perioder is
  'Append-only historik over medlemsperioder. En fornyelse er en NY række, aldrig en overskrivning. companies.contract_end_date er den seneste periodes slutdato og forbliver kanonisk for computeMembershipTier. Rådgivere kan læse og indsætte, ikke rette.';
comment on column public.company_perioder.beloeb_oere is
  'Faktisk betalt for perioden, i øre. Rate12 bærer 5 %-tillægget: 50.000 fuld = 5000000, samme aftale i 12 rater = 5250000.';
comment on column public.company_perioder.stripe_reference is
  'checkout_session-, invoice- eller subscription-id. Bærer idempotensen: et gensendt webhook-event må ikke give to perioder.';

alter table public.company_perioder enable row level security;

create policy "Advisors can view company perioder"
  on public.company_perioder for select to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role));

create policy "Advisors can insert company perioder"
  on public.company_perioder for insert to authenticated
  with check (has_role(auth.uid(), 'advisor'::app_role));

create policy "Service role can manage company perioder"
  on public.company_perioder for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);
