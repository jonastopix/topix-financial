-- Indgangens flowtilstand: prisniveau, betalingstoken og påmindelser.
-- KØRT MANUELT i Lovable SQL editor 2026-09-02. Denne fil er bogføringen,
-- så laget kan genskabes fra repoet.
--
-- Egen tabel og ikke kolonner på companies, fordi RLS i Postgres er
-- rækkeniveau, ikke kolonneniveau: et medlem læser sin egen
-- companies-række ("Members can view own company", id =
-- user_company_id(auth.uid())), og tokenet er en bæreradgang. Samme
-- begrundelse som company_fornyelse (20260811120000, linje 5-8).
-- Designet står i docs/indgangen-design.md §16.

create table if not exists public.company_betalingslink (
  company_id             uuid primary key
                         references public.companies(id) on delete cascade,
  prisniveau_oere        integer,
  underskrevet_at        timestamptz not null default now(),
  token                  uuid not null default gen_random_uuid(),
  betalingsmail_sendt_at timestamptz,
  sidste_paamindelse_dag integer,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint company_betalingslink_token_unik unique (token),
  constraint company_betalingslink_prisniveau_check
    check (prisniveau_oere is null or prisniveau_oere > 0),
  constraint company_betalingslink_paamindelse_check
    check (sidste_paamindelse_dag is null
           or sidste_paamindelse_dag = any (array[14, 25, 31]))
);

create index if not exists company_betalingslink_token_idx
  on public.company_betalingslink (token);

comment on table public.company_betalingslink is
  'Indgangens flowtilstand fra underskrift til betaling. Egen tabel og ikke kolonner på companies, fordi RLS i Postgres er rækkeniveau: et medlem læser sin egen companies-række, og tokenet er en bæreradgang der ikke må ligge i en tabel klienten kan læse. Samme begrundelse som company_fornyelse (migration 20260811120000).';

comment on column public.company_betalingslink.prisniveau_oere is
  'Det AFTALTE prisniveau fra Monday-kolonnen "Pris (kontrakt)", i øre. Bestemmer hvilke tre betalingsmodeller betalingssiden viser. NULL = prisen mangler: virksomheden oprettes alligevel, rådgiveren får en mail, og betalingsmailen udløses først når prisen sættes. IKKE det samme som companies.indgangspris_oere, som skrives af BETALINGEN fra prisens metadata.grundbeloeb. Aftalt og betalt er ikke det samme — en kan skrive under og aldrig betale.';

comment on column public.company_betalingslink.underskrevet_at is
  'Da Monday sagde "Godkendt". Fristen på 30 dage løber IKKE herfra — se betalingsmail_sendt_at.';

comment on column public.company_betalingslink.token is
  'Bærer betalingslinket: app.theboardroom.dk/betal?token=<uuid>. 122 bits, kan ikke gættes. Læses KUN serverside gennem en SECURITY DEFINER-funktion, aldrig af klienten — samme mønster som lookup_invite_company_info. Prisen må ALDRIG ligge i linket: den ligger her, så et videresendt link ikke kan give en anden virksomheds pris.';

comment on column public.company_betalingslink.betalingsmail_sendt_at is
  'Ankeret for de 30 dage, og idempotensen for de to udløsere ("Godkendt" med pris, og pris sat manuelt bagefter). Mailen må sendes ÉN gang. Udløbet er dette tidsstempel + 30 dage og gemmes IKKE som eget felt — to kilder ville kunne drive fra hinanden. NULL = mailen er ikke sendt, og tokenet er endnu ikke gyldigt.';

comment on column public.company_betalingslink.sidste_paamindelse_dag is
  'Hvilken påmindelse der sidst gik: 14, 25 eller 31. NULL = ingen endnu. Dag 0 er registreret af betalingsmail_sendt_at. Et tal frem for et tidsstempel, fordi de fire mails ligger på faste dage.';

alter table public.company_betalingslink enable row level security;

create policy "Advisors manage company betalingslink"
  on public.company_betalingslink for all to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role))
  with check (has_role(auth.uid(), 'advisor'::app_role));

create policy "Service role can manage company betalingslink"
  on public.company_betalingslink for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);
