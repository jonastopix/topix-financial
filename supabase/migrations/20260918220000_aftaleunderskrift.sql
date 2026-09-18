-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- Husets egen e-underskrift af aftalegrundlaget — datamodellen (UDKAST
-- 18/9-2026, ~/Downloads/udkast-underskrift/README.md). Ingen tredjepart.
-- Jonas 18/9: «mailkode er nok, ingen sms».
--
-- FORLØBET (chattens design 17/9 nat): rådgiveren sender et unikt link →
-- modtageren LÆSER aftalegrundlaget på siden → skriver sit navn → sætter
-- kryds ved «Jeg har læst aftalegrundlaget og accepterer det» → taster en
-- sekscifret kode fra mailen → «Underskriv». NAVNET OG KRYDSET ER
-- UNDERSKRIFTEN; koden beviser hvem; sporet beviser hvornår.
--
-- FIRE TABELLER, én bucket, to funktioner:
--   aftale_skabelon     skabelonteksten med {{pladsholdere}} — versioneret,
--                       én aktiv. Rådgivere skriver den (som email_templates).
--   aftale_underskrift  ÉN række pr. udsendt aftale: den FASTFROSNE tekst,
--                       aftrykket (SHA-256 hex over den kanoniske tekst),
--                       tokenet (bæreradgangen i linket), og underskriften.
--   aftale_kode         engangskoderne — kun HASH (sha256(aftale_id:kode)),
--                       aldrig koden selv; forsøg, brugt, erstattet.
--   aftale_spor         revisionssporet: én række pr. hændelse med IP,
--                       browser og tidspunkt (timestamptz = UTC med zone;
--                       vises i dansk tid af _shared/revisionsspor.ts).
--   storage.buckets     'aftaler' (privat): det underskrevne dokument som
--                       PDF med underskriftsside bagerst.
--   registrer_kodeforsoeg(uuid)  atomisk «forsoeg = forsoeg + 1» — supabase-js
--                       kan ikke udtrykke det, og et kapløb mellem to faner
--                       må ikke give et sjette forsøg.
--   annuller_gamle_koder(uuid)   erstat alle åbne koder på én aftale.
--
-- HVORFOR EGNE TABELLER og ikke kolonner på companies: samme grund som
-- company_betalingslink (20260902080000): RLS er rækkeniveau, tokenet er en
-- bæreradgang, og et medlem må aldrig kunne læse sin egen virksomheds token
-- eller kodehash. Medlemmet (den der skriver under) har INGEN konto endnu og
-- går KUN gennem edge-funktionen aftale-underskrift (service role), som
-- verificerer tokenet først (_shared/aftaletokenAuth.ts).
--
-- HVORFOR IKKE en anon-kaldbar SECURITY DEFINER-funktion som
-- hent_betalingstilbud: siden skal SKRIVE i sporet ved hver åbning (IP og
-- browser), og request-headere er kun til rådighed i edge-runtimen. Derfor
-- én kanal: edge-funktionen. Ingen EXECUTE til anon nogen steder her.
--
-- RLS: rådgivere læser alt (has_role advisor — admin arver) og skriver
-- skabelonen; service_role gør alt; medlemmer og anon intet. Ingen
-- SECURITY DEFINER-funktion rører has_role/user_company_id (CLAUDE.md
-- FORBIDDEN-listen er urørt).
--
-- Udløb GEMMES IKKE som eget felt (samme regel som betalingslinket, §16):
-- linkets udløb ER sendt_at + 21 dage, kodens ER oprettet_at + 15 min. To
-- kilder til samme tidspunkt ville kunne drive fra hinanden. Dommene ligger
-- i _shared/underskriftDom.ts (spejlet i src/lib, paritetstestet).
--
-- FØR-SQL (gem CSV og skriv navnet i README §9):
--   select 'aftale_underskrift' as tabel, count(*) from information_schema.tables
--     where table_schema='public' and table_name in ('aftale_skabelon','aftale_underskrift','aftale_kode','aftale_spor')
--   union all select 'bucket aftaler', count(*) from storage.buckets where id='aftaler';
--   -- forventet: 0 og 0.

-- ── 1. Skabelonen ────────────────────────────────────────────────────

create table if not exists public.aftale_skabelon (
  id            uuid primary key default gen_random_uuid(),
  navn          text not null,
  version       integer not null default 1,
  titel         text not null,
  tekst         text not null,
  aktiv         boolean not null default false,
  oprettet_af   uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint aftale_skabelon_navn_version_unik unique (navn, version),
  constraint aftale_skabelon_tekst_ikke_tom check (length(btrim(tekst)) > 0)
);

-- Højst ÉN aktiv skabelon ad gangen: send-til-underskrift læser «den aktive».
create unique index if not exists aftale_skabelon_en_aktiv
  on public.aftale_skabelon ((true)) where aktiv;

comment on table public.aftale_skabelon is
  'Aftalegrundlagets skabelon med {{pladsholdere}} (virksomhed, cvr, kontaktperson, pris_kr, dato, frist_dage). Versioneret; præcis én række er aktiv. Teksten fastfryses PR. AFTALE i aftale_underskrift ved afsendelsen — en senere ændring af skabelonen rører aldrig en sendt aftale.';

-- ── 2. Aftalen ───────────────────────────────────────────────────────

-- D1 (Jonas 18/9, ordret: «Ved underskrift»): virksomheden oprettes først NÅR
-- AFTALEN UNDERSKRIVES. En aftale hører derfor til ENTEN en ansøgning
-- (ansoegning_id — A's motor opretter virksomheden ved «underskrevet») ELLER
-- en eksisterende virksomhed (company_id — fornyelse/genindtræden, sendt fra
-- virksomhedssiden). Præcis én af dem er sat (CHECK). Ansøgningens virksomhed
-- findes bagefter som ansoegninger.company_id — kolonnen her bliver IKKE
-- efterfyldt, så CHECK'en holder og kilden er én.
-- KRÆVER A's migration 20260918200000_ansoegninger.sql FØRST (FK).
create table if not exists public.aftale_underskrift (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid references public.companies(id) on delete cascade,
  ansoegning_id         uuid references public.ansoegninger(id) on delete cascade,
  token                 uuid not null default gen_random_uuid(),
  status                text not null default 'sendt',
  skabelon_id           uuid references public.aftale_skabelon(id) on delete set null,
  dokument_titel        text not null,
  dokument_tekst        text not null,
  dokument_aftryk       text not null,
  prisniveau_oere       integer,
  modtager_email        text not null,
  modtager_navn         text,
  sendt_at              timestamptz not null default now(),
  sendt_af              uuid not null,
  underskrevet_at       timestamptz,
  underskrevet_navn     text,
  underskrevet_ip       text,
  underskrevet_user_agent text,
  pdf_sti               text,
  pdf_aftryk            text,
  kvittering_sendt_at   timestamptz,
  annulleret_at         timestamptz,
  annulleret_af         uuid,
  annulleret_grund      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint aftale_underskrift_token_unik unique (token),
  constraint aftale_underskrift_praecis_en_ejer
    check ((company_id is not null)::int + (ansoegning_id is not null)::int = 1),
  constraint aftale_underskrift_status_check
    check (status in ('sendt', 'underskrevet', 'annulleret')),
  constraint aftale_underskrift_aftryk_form
    check (dokument_aftryk ~ '^[0-9a-f]{64}$'),
  constraint aftale_underskrift_pdf_aftryk_form
    check (pdf_aftryk is null or pdf_aftryk ~ '^[0-9a-f]{64}$'),
  constraint aftale_underskrift_prisniveau_check
    check (prisniveau_oere is null or prisniveau_oere > 0),
  -- Underskrevet ⇒ navn og tidspunkt findes; ellers ingen af delene.
  constraint aftale_underskrift_underskrift_hel
    check ((status = 'underskrevet') = (underskrevet_at is not null and underskrevet_navn is not null))
);

create index if not exists aftale_underskrift_company_idx
  on public.aftale_underskrift (company_id, sendt_at desc);

-- Højst ÉN åben (sendt) aftale pr. virksomhed og pr. ansøgning:
-- send-til-underskrift svarer 409 på den anden, medmindre kalderen beder om
-- at erstatte (annullér først).
create unique index if not exists aftale_underskrift_en_aaben_pr_virksomhed
  on public.aftale_underskrift (company_id) where status = 'sendt' and company_id is not null;
create unique index if not exists aftale_underskrift_en_aaben_pr_ansoegning
  on public.aftale_underskrift (ansoegning_id) where status = 'sendt' and ansoegning_id is not null;
create index if not exists aftale_underskrift_ansoegning_idx
  on public.aftale_underskrift (ansoegning_id, sendt_at desc) where ansoegning_id is not null;

comment on table public.aftale_underskrift is
  'Én række pr. udsendt aftalegrundlag. dokument_tekst er FASTFROSSET ved afsendelsen og dokument_aftryk er SHA-256 hex over den kanoniske tekst — regnes igen ved underskriften og skal være ens. token er bæreradgangen i linket app.theboardroom.dk/aftale?token=<uuid> (122 bit); udløbet er sendt_at + 21 dage og gemmes ikke. Læses KUN serverside (edge-funktionen aftale-underskrift) — aldrig af klienten, aldrig via anon-RPC. Underskriften er navn + kryds + kode (underskrevet_navn, underskrevet_at, IP, browser); dokumentet med underskriftsside ligger i bucket aftaler på pdf_sti med pdf_aftryk.';

comment on column public.aftale_underskrift.dokument_aftryk is
  'SHA-256 hex (64 tegn) over kanoniskTekst(dokument_tekst). Skrives ved afsendelsen, står i sporet, i mailen og på PDF-siden. Ingen kan senere påstå at teksten var en anden.';

comment on column public.aftale_underskrift.prisniveau_oere is
  'Det prisniveau aftalen lyder på (4000000 eller 5000000). Virksomhedsvejen: bliver company_betalingslink.prisniveau_oere når der skrives under (README §6). Ansøgningsvejen: kopieret fra ansoegninger.pris_oere ved afsendelsen — motoren læser pris_oere selv ved «underskrevet». NULL = aftalen nævner ingen pris; så lander virksomheden i afventer_pris som i dag.';

comment on column public.aftale_underskrift.ansoegning_id is
  'Sat når aftalen er sendt fra en ansøgning (A''s motor, D1: virksomheden oprettes ved underskriften). Ved «underskriv» kalder aftale-underskrift udfoerOvergang(underskrevet, via e_signatur), som opretter virksomheden og starter betalingsforløbet. Virksomheden findes derefter som ansoegninger.company_id.';

-- ── 3. Koderne ───────────────────────────────────────────────────────

create table if not exists public.aftale_kode (
  id            uuid primary key default gen_random_uuid(),
  aftale_id     uuid not null references public.aftale_underskrift(id) on delete cascade,
  kode_hash     text not null,
  oprettet_at   timestamptz not null default now(),
  forsoeg       integer not null default 0,
  brugt_at      timestamptz,
  erstattet_at  timestamptz,
  ip            text,
  user_agent    text,
  constraint aftale_kode_hash_form check (kode_hash ~ '^[0-9a-f]{64}$'),
  constraint aftale_kode_forsoeg_check check (forsoeg >= 0 and forsoeg <= 5)
);

create index if not exists aftale_kode_aftale_idx
  on public.aftale_kode (aftale_id, oprettet_at desc);

comment on table public.aftale_kode is
  'Engangskoderne til underskriften. KUN hash (sha256(aftale_id || '':'' || kode)) — koden selv findes kun i mailen. Gyldig 15 min fra oprettet_at (gemmes ikke), højst 5 forkerte forsøg (forsoeg, CHECK ≤ 5), brugt én gang (brugt_at), erstattet når en nyere bestilles (erstattet_at). Dommene: _shared/underskriftDom.ts.';

-- ── 4. Sporet ────────────────────────────────────────────────────────

create table if not exists public.aftale_spor (
  id            bigint generated always as identity primary key,
  aftale_id     uuid not null references public.aftale_underskrift(id) on delete cascade,
  tidspunkt     timestamptz not null default now(),
  haendelse     text not null,
  ip            text,
  user_agent    text,
  detaljer      jsonb,
  constraint aftale_spor_haendelse_check check (haendelse in (
    'link_sendt', 'link_aabnet', 'afvist_udloebet',
    'kode_sendt', 'kode_forkert', 'kode_laast', 'kode_udloebet',
    'underskrevet', 'kvittering_sendt', 'annulleret'
  ))
);

create index if not exists aftale_spor_aftale_idx
  on public.aftale_spor (aftale_id, tidspunkt);

comment on table public.aftale_spor is
  'Revisionssporet for e-underskriften — én række pr. hændelse: link sendt, åbnet, kode sendt, kode tastet (også fejlforsøg), underskrevet, kvittering. tidspunkt er timestamptz (UTC, vises i dansk tid med offset af _shared/revisionsspor.ts). ip og user_agent fra edge-runtimens request-headere (cf-connecting-ip / x-forwarded-for / user-agent — IKKE MÅLT i prod endnu, README §5). Sporet står i klartekst på PDF''ens sidste side. Skrives KUN af service_role; ændres og slettes aldrig (ingen UPDATE/DELETE-politik).';

-- ── 5. RLS ───────────────────────────────────────────────────────────

alter table public.aftale_skabelon    enable row level security;
alter table public.aftale_underskrift enable row level security;
alter table public.aftale_kode        enable row level security;
alter table public.aftale_spor        enable row level security;

-- Skabelonen: rådgivere skriver og læser (som email_templates).
create policy "Advisors manage aftale skabelon"
  on public.aftale_skabelon for all to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role))
  with check (has_role(auth.uid(), 'advisor'::app_role));
create policy "Service role can manage aftale skabelon"
  on public.aftale_skabelon for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

-- Aftalen: rådgivere LÆSER (status, spor, PDF-sti). De skriver ikke selv —
-- afsendelse og annullering går gennem send-til-underskrift (Bucket A), så
-- der aldrig findes en sendt aftale uden spor og mail.
create policy "Advisors can view aftale underskrift"
  on public.aftale_underskrift for select to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role));
create policy "Service role can manage aftale underskrift"
  on public.aftale_underskrift for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

-- Koderne: KUN service_role. Ikke engang rådgivere læser hash'ene.
create policy "Service role can manage aftale kode"
  on public.aftale_kode for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

-- Sporet: rådgivere læser; service_role INDSÆTTER. Ingen UPDATE, ingen
-- DELETE for nogen — et spor rettes ikke. (Service-role omgår RLS, så
-- «ingen politik» er en hensigtserklæring for koden, ikke et værn mod
-- service_role; kildeværnet låser at koden aldrig opdaterer eller sletter.)
create policy "Advisors can view aftale spor"
  on public.aftale_spor for select to authenticated
  using (has_role(auth.uid(), 'advisor'::app_role));
create policy "Service role can insert aftale spor"
  on public.aftale_spor for insert
  with check (auth.role() = 'service_role'::text);
create policy "Service role can read aftale spor"
  on public.aftale_spor for select
  using (auth.role() = 'service_role'::text);

-- ── 6. Bucket ────────────────────────────────────────────────────────

-- Privat. Kun PDF, højst 10 MB (dokumentet er tekst + én side; målt i
-- udkastets Deno-test: ~7 KB for 5 sider). Sti: <aftale_id>/aftale-underskrevet.pdf (aftalens id, ikke virksomhedens — ansøgningens virksomhed findes først ved underskriften)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aftaler', 'aftaler', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Rådgivere læser (signeret URL fra klienten); service_role skriver.
-- Medlemmet får sin kopi via kvitteringsmailens link → edge-funktionen
-- (handling hent_dokument, signeret URL 10 min) — ingen storage-politik
-- for medlemmer i V0 (README §10, åbent).
create policy "Advisors can read aftaler"
  on storage.objects for select to authenticated
  using (bucket_id = 'aftaler' and has_role(auth.uid(), 'advisor'::app_role));
create policy "Service role can manage aftaler"
  on storage.objects for all
  using (bucket_id = 'aftaler' and auth.role() = 'service_role'::text)
  with check (bucket_id = 'aftaler' and auth.role() = 'service_role'::text);

-- ── 7. Funktioner (kun service_role) ─────────────────────────────────

-- Atomisk optælling af et forkert forsøg. Svarer det nye antal, eller NULL
-- når koden er brugt/erstattet/allerede låst (ingen række ramt). CHECK ≤ 5
-- på kolonnen er det sidste værn; WHERE forsoeg < 5 gør at to samtidige
-- forkerte forsøg aldrig kan give 6.
create or replace function public.registrer_kodeforsoeg(p_kode_id uuid)
returns integer
language sql
volatile
security definer
set search_path to 'public'
as $$
  update public.aftale_kode
     set forsoeg = forsoeg + 1
   where id = p_kode_id
     and brugt_at is null
     and erstattet_at is null
     and forsoeg < 5
  returning forsoeg
$$;

comment on function public.registrer_kodeforsoeg(uuid) is
  'Atomisk forsoeg = forsoeg + 1 på en åben engangskode. KUN service_role (edge-funktionen aftale-underskrift). NULL = ingen række ramt (brugt, erstattet eller allerede 5).';

revoke all on function public.registrer_kodeforsoeg(uuid) from public;
revoke all on function public.registrer_kodeforsoeg(uuid) from anon;
revoke all on function public.registrer_kodeforsoeg(uuid) from authenticated;
grant execute on function public.registrer_kodeforsoeg(uuid) to service_role;

-- Erstat alle åbne koder på aftalen i ét kald (før en ny indsættes).
create or replace function public.annuller_gamle_koder(p_aftale_id uuid)
returns integer
language sql
volatile
security definer
set search_path to 'public'
as $$
  with r as (
    update public.aftale_kode
       set erstattet_at = now()
     where aftale_id = p_aftale_id
       and brugt_at is null
       and erstattet_at is null
    returning 1
  )
  select count(*)::integer from r
$$;

comment on function public.annuller_gamle_koder(uuid) is
  'Sætter erstattet_at på alle åbne koder for en aftale. KUN service_role. Kaldes FØR en ny kode indsættes, så der altid er højst én gyldig kode.';

revoke all on function public.annuller_gamle_koder(uuid) from public;
revoke all on function public.annuller_gamle_koder(uuid) from anon;
revoke all on function public.annuller_gamle_koder(uuid) from authenticated;
grant execute on function public.annuller_gamle_koder(uuid) to service_role;

-- ── 8. Startskabelon ─────────────────────────────────────────────────
-- PLADSHOLDER. Jonas leverer den rigtige tekst; indtil da er den aktive
-- skabelon tydeligt mærket, så ingen sender den ved et uheld.

insert into public.aftale_skabelon (navn, version, titel, tekst, aktiv)
values (
  'aftalegrundlag',
  1,
  'Aftalegrundlag — The Boardroom',
  E'INDSÆT AFTALEGRUNDLAGETS TEKST HER (udkast 18/9-2026 — ikke den rigtige tekst).\n\nVirksomhed: {{virksomhed}} (CVR {{cvr}})\nKontaktperson: {{kontaktperson}}\nPris: {{pris_kr}} kr. ekskl. moms pr. år\nDato: {{dato}}\n\nBetaling senest {{frist_dage}} dage efter underskrift. Betales der ikke inden fristen, sendes en faktura på det fulde beløb.',
  true
)
on conflict (navn, version) do nothing;

-- EFTER-SQL:
--   select table_name from information_schema.tables where table_schema='public' and table_name like 'aftale_%' order by 1;  -- 4 rækker
--   select id, public, allowed_mime_types from storage.buckets where id='aftaler';                                        -- 1 række, false
--   select proname, prosecdef from pg_proc where proname in ('registrer_kodeforsoeg','annuller_gamle_koder');              -- 2 rækker, true
--   select count(*) from public.aftale_skabelon where aktiv;                                                              -- 1
