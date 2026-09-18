-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- ANSØGNINGSMOTOREN (18/9-2026): ansøgningsflowet flyttes fra Monday ind i
-- platformen. Jonas 18/9 (ordret): «Vi bygger ikke en kopi af Monday. Vi
-- bygger et meget smartere og mere moderne flow.» Tre tabeller:
--
--   ansoegninger            én række pr. ansøgning — fra første tastetryk i
--                           formularen (B's kladde: token, indsendt_at) til
--                           underskrift. DE FIRE TING Mondays statusfelt bar
--                           på én gang står her hver for sig: trin (7
--                           værdier) · lukkeaarsag · rykkere_sendt
--                           (forsøgsnummeret som et tal) · næste handling =
--                           en RÆKKE i planlagte_haendelser med en dato.
--   ansoegning_beslutninger hver overgang med hvem og hvornår: menneskets
--                           to beslutninger (tal_med_dem/afvis; tilbud/
--                           afslag) bærer truffet_af; systemets (Calendly,
--                           køen, ansøgerens link) bærer truffet_via.
--   planlagte_haendelser    RYKKERKØEN som generel mekanisme: hvad, hvornår,
--                           til hvem, hvilken skabelon, hvilken ansøgning —
--                           og en idempotensnøgle (UNIQUE) som stripe-
--                           webhookens stripe_reference: en mail kan aldrig
--                           sendes to gange. Ét cron-job (20260918210000)
--                           sender de forfaldne; reglerne bor i
--                           _shared/rykkerkoe.ts.
--
-- ÉN TABEL MED B (koordineret 18/9): B's udkast 20260918120000_ansoegninger
-- .sql siger selv «FORSLAG — A bygger datamodellen». B's kolonner står her
-- ORDRET (blokken «FELTER — B EJER»: token, indsendt_at, paamindelse_sendt_at,
-- kilde/kilde_raa/ip_hash, cvr/cvr_opslag/cvr_bekraeftet, hjemmeside,
-- omsaetningsinterval A–G, antal_ansatte, navn/email/telefon, udfordring/
-- proevet/om_tolv_maaneder, start_tidspunkt, set_webinar), så B's
-- ansoegning-gem/-cvr og hent_ansoegning_til_gem virker uændret. B's
-- migration reduceres til cvr_opslag_cache + RPC'en og får et timestamp
-- EFTER denne (README §2). Kladden = indsendt_at IS NULL: motoren rører
-- den ikke, rådgiverens liste viser den ikke (CHECK: trin ≠ ny ⇒ indsendt).
--
-- ANSØGNINGEN BLIVER TIL VIRKSOMHEDEN MED SAMME ID: ved «underskrevet»
-- opretter motoren companies-rækken med id = ansoegninger.id (diff i
-- _shared/virksomhedsOprettelse.ts: valgfrit id) og sætter company_id = id.
-- ÉN undtagelse, sagt højt: findes der allerede en virksomhed på CVR'et
-- (genindtræden), genbruges DEN (som Monday-vejen i dag), og company_id
-- peger på den — ingen dublet, ingen synk. company_id kan derfor ikke
-- CHECK'es til «= id»; reglen håndhæves i motoren og låses af
-- ansoegningMotor.guard.test.ts. Ansøgningen lever ikke i companies før
-- underskrift: companies.status er bundet til active|tidligere
-- (20260911040000), og alt fra forsidens dom til «siden sidst» læser
-- companies som «medlemmer» — en ansøger dér ville være støj i 20 flader.
--
-- KOBLINGEN TIL BETALINGSFORLØBET: company_betalingslink får ansoegning_id
-- (partielt unikt, som monday_item_id): ét ansøgnings-id giver højst én
-- linkrække. Efter underskrift overtager det EKSISTERENDE forløb (dag 0-
-- mail, 30 dage, faktura dag 31) — intet nyt bygges der.
--
-- RLS: rådgivere LÆSER alt (B's politik) og må OPDATERE (note, pris_oere);
-- men trin, lukkeaarsag, pause, company_id, token, anbefaling og samtalen
-- må KUN ændres af service role — en NY BEFORE UPDATE-trigger
-- (protect_ansoegning_motor_fields) afviser andre. Den er ny, på egen
-- tabel, ikke på auth.users, ikke SECURITY DEFINER — CLAUDE.md forbyder
-- ÆNDRING af protect_*/auth-triggere; en ny på en ny tabel siges højt her.
-- Ansøgeren har INGEN politik (ingen politik = ingen adgang): «ansøgeren
-- ser kun sin egen gennem sit link» går gennem edge functions med token
-- som legitimation — B's ansoegning-gem FØR indsendelse
-- (hent_ansoegning_til_gem, B's SECURITY DEFINER, B's STOP), motorens
-- ansoegning-link EFTER (verifyAnsoegningslink: service-role-opslag på
-- token, ingen SQL-funktion). INGEN SECURITY DEFINER i denne migration.
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables where table_schema = 'public'
--      and table_name in ('ansoegninger', 'ansoegning_beslutninger', 'planlagte_haendelser')
--   union all
--   select '2 betalingslink', column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'company_betalingslink' and column_name = 'ansoegning_id'
--   union all
--   select '3 updated_at-fn', 'findes', count(*)::text from pg_proc where proname = 'update_updated_at_column'
--   union all
--   select '4 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 = ingen rækker (er ansoegninger der allerede — B's udkast kørt først — STOP:
--   så skal B's tabel droppes tom, eller denne fil laves om til ALTER TABLE ADD COLUMN);
--   sektion 2 = ingen rækker; sektion 3 = 1 (mangler den: STOP, triggeren kræver den).
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt plus
--   select '5 kolonner', concat(table_name, '.', column_name), concat(data_type, ' | ', is_nullable)
--     from information_schema.columns where table_schema = 'public'
--      and table_name in ('ansoegninger', 'ansoegning_beslutninger', 'planlagte_haendelser')
--   union all
--   select '6 politikker', concat(tablename, ': ', policyname), concat(cmd, ' | ', roles::text) from pg_policies
--    where schemaname = 'public' and tablename in ('ansoegninger', 'ansoegning_beslutninger', 'planlagte_haendelser')
--   union all
--   select '7 indeks', indexname, indexdef from pg_indexes
--    where schemaname = 'public' and (tablename in ('ansoegninger', 'planlagte_haendelser') or indexname = 'company_betalingslink_ansoegning_unik')
--   union all
--   select '8 triggere', tgname, pg_get_triggerdef(oid) from pg_trigger
--    where tgrelid = 'public.ansoegninger'::regclass and not tgisinternal
--   FACIT EFTER: sektion 1 = 3 rækker; sektion 2 = 1 (uuid); sektion 5 = 41 + 10 + 18 kolonner;
--   sektion 6 = 7 politikker (ansoegninger: advisor read, advisor update, service all;
--   beslutninger: advisor select, service all; planlagte_haendelser: advisor select, service all);
--   sektion 8 = 2 triggere (ansoegninger_updated_at, protect_ansoegning_motor_fields); alle tre tabeller 0 rækker.
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK (ingen data i prod før flowet er tændt):
--   drop trigger if exists protect_ansoegning_motor_fields on public.ansoegninger;
--   drop function if exists public.protect_ansoegning_motor_fields();
--   drop index if exists public.company_betalingslink_ansoegning_unik;
--   alter table public.company_betalingslink drop column if exists ansoegning_id;
--   drop table if exists public.planlagte_haendelser;
--   drop table if exists public.ansoegning_beslutninger;
--   drop table if exists public.ansoegninger;

-- ── 1. ansoegninger ──────────────────────────────────────────────────────
create table if not exists public.ansoegninger (
  id                    uuid primary key default gen_random_uuid(),

  -- FELTER — B EJER (ordret fra B's udkast 20260918120000; formularen skriver dem)
  -- Genoptagelsestokenet: bæres i /ansoeg?t=…, localStorage og påmindelsen.
  -- EFTER indsendelse er det ansøgerens link (ansoegning-link: status, «ikke nu»).
  token                 uuid not null unique default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  indsendt_at           timestamptz,
  -- (B's paamindelse_sendt_at er UDGÅET — Jonas D6 18/9: kladde-påmindelsen er
  --  trappen «kladde» i planlagte_haendelser; stemplet er køens række.)
  kilde                 text not null default 'direkte'
                        check (kilde in ('webinar','anbefaling','linkedin','direkte','andet')),
  kilde_raa             text,
  ip_hash               text,
  cvr                   text check (cvr is null or cvr ~ '^\d{8}$'),
  cvr_opslag            jsonb,
  cvr_bekraeftet        boolean not null default false,
  hjemmeside            text,
  omsaetningsinterval   text check (omsaetningsinterval is null or omsaetningsinterval in ('A','B','C','D','E','F','G')),
  antal_ansatte         integer check (antal_ansatte is null or antal_ansatte between 0 and 999999),
  navn                  text,
  email                 text,
  telefon               text,
  udfordring            text,
  proevet               text,
  om_tolv_maaneder      text,
  start_tidspunkt       text check (start_tidspunkt is null or start_tidspunkt in ('hurtigst_muligt','inden_1_maaned','inden_3_maaneder','senere')),
  set_webinar           text check (set_webinar is null or set_webinar in ('ja','nej')),

  -- MOTOREN — DE FIRE ADSKILTE (Mondays ene statusfelt)
  trin                  text not null default 'ny',
  lukkeaarsag           text,
  lukket_at             timestamptz,
  lukket_af             uuid references auth.users(id) on delete set null,
  lukket_fra_trin       text,
  rykkere_sendt         integer not null default 0,
  trin_sat_at           timestamptz not null default now(),
  paa_pause_til         date,

  -- KOBLINGEN: bliver virksomheden med samme id (eller CVR-genbrug — se filhovedet)
  company_id            uuid references public.companies(id) on delete set null,
  konverteret_at        timestamptz,

  -- ANBEFALINGEN (skrives ved indsendelse — _shared/ansoegningAnbefaling.ts)
  anbefaling            jsonb,

  -- SAMTALEN (Calendly-webhooken)
  samtale_start         timestamptz,
  samtale_slut          timestamptz,
  calendly_event_uri    text,

  -- TILBUDDET (rådgiveren sætter prisen før «tilbud»; går videre som prisniveau_oere)
  pris_oere             integer,
  -- Linket til aftalegrundlaget (C's /aftale?token=… eller en PDF) — gives ind ved «tilbud»; rykkerne linker til det.
  aftale_url            text,
  note                  text,

  constraint ansoegninger_trin_check check (trin in ('ny', 'indkaldt', 'booket', 'afholdt', 'aftalegrundlag_sendt', 'underskrevet', 'lukket')),
  constraint ansoegninger_lukkeaarsag_check check (lukkeaarsag is null or lukkeaarsag in ('afslag_efter_ansoegning', 'afslag_efter_samtale', 'svarer_ikke', 'udloebet', 'trak_sig', 'dublet', 'andet')),
  constraint ansoegninger_lukket_check check ((trin = 'lukket') = (lukkeaarsag is not null)),
  constraint ansoegninger_lukket_fra_check check (lukket_fra_trin is null or lukket_fra_trin in ('ny', 'indkaldt', 'booket', 'afholdt', 'aftalegrundlag_sendt')),
  constraint ansoegninger_indsendt_check check (trin = 'ny' or indsendt_at is not null),
  constraint ansoegninger_rykkere_check check (rykkere_sendt >= 0),
  constraint ansoegninger_email_check check (email is null or email = lower(email)),
  constraint ansoegninger_pris_check check (pris_oere is null or pris_oere > 0),
  constraint ansoegninger_samtale_check check (samtale_slut is null or samtale_start is null or samtale_slut > samtale_start)
);

-- B's indeks til oprettelsesloftet — uændret. (B's paamindelse-indeks udgår med kolonnen.)
create index if not exists ansoegninger_ip_hash_created_idx
  on public.ansoegninger (ip_hash, created_at);

-- Motorens: én ÅBEN, INDSENDT ansøgning pr. mailadresse — en gentagen
-- indsendelse (ny kladde, samme mail) afvises af indekset i ansoegning-gem's
-- indsend (23505 → «du har allerede en ansøgning hos os»).
create unique index if not exists ansoegninger_aaben_email_uidx
  on public.ansoegninger (email)
  where indsendt_at is not null and email is not null and trin not in ('lukket', 'underskrevet');
create index if not exists ansoegninger_trin_idx on public.ansoegninger (trin, trin_sat_at desc) where indsendt_at is not null;
create index if not exists ansoegninger_company_idx on public.ansoegninger (company_id) where company_id is not null;
create index if not exists ansoegninger_cvr_idx on public.ansoegninger (cvr) where cvr is not null;

comment on table public.ansoegninger is
  'Ansøgningen (18/9-2026): én række fra formularens første gem (B: token, indsendt_at) til underskrift (A: motoren). Mondays statusfelt er delt i fire: trin · lukkeaarsag · rykkere_sendt · næste handling (en række i planlagte_haendelser). Bliver virksomheden med samme id ved underskrift (company_id = id; CVR-genbrug er eneste undtagelse). Kladde = indsendt_at IS NULL. Ingen klientadgang for ansøgeren: ansoegning-gem (før) og ansoegning-link (efter) bag tokenet.';
comment on column public.ansoegninger.trin is 'ny | indkaldt | booket | afholdt | aftalegrundlag_sendt | underskrevet | lukket. Ændres kun af service role (protect_ansoegning_motor_fields). DIREKTE TILBUD FINDES IKKE: ny → aftalegrundlag_sendt afvises af afgoerOvergang. Kun meningsfuldt når indsendt_at er sat.';
comment on column public.ansoegninger.rykkere_sendt is 'Forsøgsnummeret som et tal: antal rykkere sendt på det NUVÆRENDE trin. Nulstilles ved trinskift; tælles op af ansoegning-rykker-cron.';
comment on column public.ansoegninger.paa_pause_til is '«Ikke nu»-linket: i dag + 3 måneder. Alle trapper annulleret; én række (pause_slut) til rådgiveren. Ophæves af enhver anden reaktion.';
comment on column public.ansoegninger.company_id is 'Sættes ved underskrift: = id (ny virksomhed) eller den eksisterende virksomheds id ved CVR-genbrug. Aldrig før underskrift.';
comment on column public.ansoegninger.token is 'B: genoptagelsestoken før indsendelse (hent_ansoegning_til_gem). A: ansøgerens link efter indsendelse (ansoegning-link). 122 bit — aldrig i en log, aldrig i et svar til andre end ansøgeren.';
comment on column public.ansoegninger.anbefaling is '{udfald: tal_med_dem|tvivl|afvis, grundlag: string[], for: string[], imod: string[], version} — _shared/ansoegningAnbefaling.ts ved indsendelse. Et forslag, aldrig en beslutning.';
comment on column public.ansoegninger.pris_oere is 'Kontraktprisen i øre ekskl. moms — rådgiveren sætter den før «tilbud»; ved underskrift bliver den company_betalingslink.prisniveau_oere.';

-- ── 2. ansoegning_beslutninger — hver overgang, med hvem og hvornår ──────
create table if not exists public.ansoegning_beslutninger (
  id             uuid primary key default gen_random_uuid(),
  ansoegning_id  uuid not null references public.ansoegninger(id) on delete cascade,
  handling       text not null,
  fra_trin       text not null,
  til_trin       text not null,
  lukkeaarsag    text,
  -- null = systemet; ellers rådgiveren (auth.uid)
  truffet_af     uuid references auth.users(id) on delete set null,
  truffet_via    text not null,
  begrundelse    text,
  truffet_at     timestamptz not null default now(),
  constraint ansoegning_beslutninger_handling_check check (handling in ('tal_med_dem', 'afvis', 'book', 'aflys_booking', 'afholdt', 'tilbud', 'afslag', 'underskrevet', 'svarer_ikke', 'udloeb', 'ikke_nu', 'luk', 'genaabn')),
  constraint ansoegning_beslutninger_via_check check (truffet_via in ('raadgiver', 'koe', 'calendly', 'ansoeger_link', 'e_signatur')),
  constraint ansoegning_beslutninger_menneske_check check (truffet_via <> 'raadgiver' or truffet_af is not null)
);

create index if not exists ansoegning_beslutninger_ansoegning_idx on public.ansoegning_beslutninger (ansoegning_id, truffet_at desc);

comment on table public.ansoegning_beslutninger is
  'Append-only: hver overgang på en ansøgning. Menneskets to beslutninger (tal_med_dem/afvis efter ansøgningen; tilbud/afslag efter samtalen) bærer truffet_af (CHECK: raadgiver ⇒ truffet_af). Systemets overgange (Calendly, køen, ansøgerens link) bærer truffet_via. Skrives kun af service role.';

-- ── 3. planlagte_haendelser — rykkerkøen ─────────────────────────────────
create table if not exists public.planlagte_haendelser (
  id               uuid primary key default gen_random_uuid(),
  ansoegning_id    uuid not null references public.ansoegninger(id) on delete cascade,
  trappe           text not null,
  trin_nr          integer not null,
  handling         text not null,
  skabelon         text,
  modtager         text not null,
  planlagt_til     timestamptz not null,
  status           text not null default 'planlagt',
  idempotensnoegle text not null,
  udfoert_at       timestamptz,
  sendt_til        text,
  message_id       text,
  udskudt_antal    integer not null default 0,
  annulleret_at    timestamptz,
  annulleret_grund text,
  fejl             text,
  fejl_antal       integer not null default 0,
  created_at       timestamptz not null default now(),
  constraint planlagte_haendelser_trappe_check check (trappe in ('kladde', 'indkaldt', 'booket', 'aftalegrundlag', 'pause')),
  constraint planlagte_haendelser_handling_check check (handling in ('send_mail', 'luk_svarer_ikke', 'udloeb', 'marker_afholdt', 'pause_slut')),
  constraint planlagte_haendelser_modtager_check check (modtager in ('ansoeger', 'raadgiver')),
  constraint planlagte_haendelser_status_check check (status in ('planlagt', 'sendt', 'udfoert', 'annulleret', 'fejlet')),
  constraint planlagte_haendelser_skabelon_check check ((handling = 'send_mail') = (skabelon is not null)),
  constraint planlagte_haendelser_trin_nr_check check (trin_nr >= 0),
  constraint planlagte_haendelser_idempotens_unik unique (idempotensnoegle)
);

-- Cronens forespørgsel: de forfaldne planlagte, ældste først.
create index if not exists planlagte_haendelser_forfaldne_idx
  on public.planlagte_haendelser (planlagt_til)
  where status = 'planlagt';
create index if not exists planlagte_haendelser_ansoegning_idx on public.planlagte_haendelser (ansoegning_id, status);
-- Én-mail-pr.-person-pr.-dag: sendte rækker pr. modtager pr. dag.
create index if not exists planlagte_haendelser_sendt_idx
  on public.planlagte_haendelser (sendt_til, udfoert_at)
  where status = 'sendt';

comment on table public.planlagte_haendelser is
  'Rykkerkøen (18/9-2026; trappen kladde = formularens påmindelse, Jonas D6): én række pr. planlagt handling — hvad (handling), hvornår (planlagt_til), til hvem (modtager), hvilken skabelon, hvilken ansøgning. UNIQUE (idempotensnoegle) = ansoegning:<id>:<trappe>:<anker>:<trin_nr>; nøglen gives videre som email_send_log.message_id (UNIQUE WHERE status = sent), så en mail aldrig sendes to gange. Reglerne (reaktion annullerer, hverdage 07–16, én mail pr. person pr. dag, «ikke nu» = 3 måneders pause) bor i _shared/rykkerkoe.ts; ansoegning-rykker-cron sender de forfaldne.';
comment on column public.planlagte_haendelser.status is 'planlagt → sendt (mail) | udfoert (intern handling) | annulleret (reaktion/trinskift) | fejlet (efter 3 forsøg).';

-- ── 4. Koblingen til betalingsforløbet ───────────────────────────────────
alter table public.company_betalingslink
  add column if not exists ansoegning_id uuid references public.ansoegninger(id) on delete set null;

create unique index if not exists company_betalingslink_ansoegning_unik
  on public.company_betalingslink (ansoegning_id)
  where ansoegning_id is not null;

comment on column public.company_betalingslink.ansoegning_id is
  'Ansøgningen der blev underskrevet (18/9-2026) — samme rolle som monday_item_id for Monday-vejen: partielt unikt, ét ansøgnings-id giver højst én linkrække. Motoren slår op her før noget oprettes (idempotens for «underskrevet»).';

-- ── 5. Triggere ──────────────────────────────────────────────────────────
drop trigger if exists ansoegninger_updated_at on public.ansoegninger;
create trigger ansoegninger_updated_at
  before update on public.ansoegninger
  for each row execute function public.update_updated_at_column();

-- NY trigger på egen tabel (ikke auth.users, ikke SECURITY DEFINER):
-- motorens felter må kun ændres af service role — trinnet går altid
-- gennem afgoerOvergang i edge functionen, aldrig fra en flade.
create or replace function public.protect_ansoegning_motor_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.trin is distinct from old.trin
     or new.lukkeaarsag is distinct from old.lukkeaarsag
     or new.lukket_at is distinct from old.lukket_at
     or new.lukket_af is distinct from old.lukket_af
     or new.lukket_fra_trin is distinct from old.lukket_fra_trin
     or new.rykkere_sendt is distinct from old.rykkere_sendt
     or new.trin_sat_at is distinct from old.trin_sat_at
     or new.paa_pause_til is distinct from old.paa_pause_til
     or new.company_id is distinct from old.company_id
     or new.konverteret_at is distinct from old.konverteret_at
     or new.token is distinct from old.token
     or new.indsendt_at is distinct from old.indsendt_at
     or new.anbefaling is distinct from old.anbefaling
     or new.samtale_start is distinct from old.samtale_start
     or new.samtale_slut is distinct from old.samtale_slut
     or new.calendly_event_uri is distinct from old.calendly_event_uri
  then
    raise exception 'ansoegninger: motorens felter (trin, lukkeaarsag, pause, company_id, token, indsendt_at, anbefaling, samtale) ændres kun gennem ansoegning-handling' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_ansoegning_motor_fields on public.ansoegninger;
create trigger protect_ansoegning_motor_fields
  before update on public.ansoegninger
  for each row execute function public.protect_ansoegning_motor_fields();

-- ── 6. RLS ───────────────────────────────────────────────────────────────
alter table public.ansoegninger enable row level security;
alter table public.ansoegning_beslutninger enable row level security;
alter table public.planlagte_haendelser enable row level security;

-- B's læsepolitik (samme navn som B's udkast, så den ikke dubleres).
drop policy if exists "Advisors can read ansoegninger" on public.ansoegninger;
create policy "Advisors can read ansoegninger"
  on public.ansoegninger for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Advisors can update ansoegninger" on public.ansoegninger;
create policy "Advisors can update ansoegninger"
  on public.ansoegninger for update to authenticated
  using (public.has_role(auth.uid(), 'advisor'))
  with check (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage ansoegninger" on public.ansoegninger;
create policy "Service role can manage ansoegninger"
  on public.ansoegninger for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

drop policy if exists "Advisors can view ansoegning_beslutninger" on public.ansoegning_beslutninger;
create policy "Advisors can view ansoegning_beslutninger"
  on public.ansoegning_beslutninger for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage ansoegning_beslutninger" on public.ansoegning_beslutninger;
create policy "Service role can manage ansoegning_beslutninger"
  on public.ansoegning_beslutninger for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

drop policy if exists "Advisors can view planlagte_haendelser" on public.planlagte_haendelser;
create policy "Advisors can view planlagte_haendelser"
  on public.planlagte_haendelser for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage planlagte_haendelser" on public.planlagte_haendelser;
create policy "Service role can manage planlagte_haendelser"
  on public.planlagte_haendelser for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('ansoegninger', 'ansoegning_beslutninger', 'planlagte_haendelser')) as tabeller,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('ansoegninger', 'ansoegning_beslutninger', 'planlagte_haendelser')) as politikker,
  (select count(*) from pg_trigger where tgrelid = 'public.ansoegninger'::regclass and not tgisinternal) as triggere;
