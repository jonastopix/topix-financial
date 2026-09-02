-- Fristen er kontraktens: 30 dage fra UNDERSKRIFTEN, ikke fra betalingsmailen.
-- RETTELSE 2/9 (Jonas): 1/9 blev det besluttet at fristen skulle løbe fra
-- betalingsmailen (§19). Det var forkert — aftalegrundlaget giver 30 dage
-- fra underskrift, og det er kontraktens frist, ikke vores at give. Dag
-- 0-mailen sagde hele tiden «30 dage fra underskriften». Konsekvensen er
-- tilsigtet: sættes prisen fire dage efter godkendelsen, har medlemmet 26
-- dage tilbage.
--
-- De to funktioner fra 20260902090000 (hent_betalingstilbud) og
-- 20260902120000 (hent_betalingsdata_til_checkout) erstattes her med
-- create or replace; de gamle filer bliver stående som historik.
-- Samme regnestykke som motoren (src/lib/betalingsfrist.ts):
--   dage = current_date - underskrevet_at::date
--   frist_overskredet når dage > 30; dag 30 er stadig inden for fristen.
-- betalingsmail_sendt_at bruges KUN til at skelne klar_til_mail fra
-- afventer_betaling — aldrig til at regne dage.
--
-- DEPLOY: manuelt i Lovable -> SQL editor efter merge (CLAUDE.md —
-- migrationer auto-deployer aldrig). Verificér bagefter:
--   SELECT pg_get_functiondef('public.hent_betalingstilbud(uuid)'::regprocedure);
--   SELECT pg_get_functiondef('public.hent_betalingsdata_til_checkout(uuid)'::regprocedure);

-- ── 1. Kolonnekommentarerne siger nu det rigtige ──
comment on column public.company_betalingslink.underskrevet_at is
  'Da Monday sagde "Godkendt". FRISTEN PÅ 30 DAGE LØBER HERFRA — den er kontraktens (rettet 2/9). Alle dage i motoren, mailene og SQL-funktionerne regnes fra dette stempel.';

comment on column public.company_betalingslink.betalingsmail_sendt_at is
  'Dag 0 og idempotensen for de to udløsere ("Godkendt" med pris, og pris sat manuelt bagefter). Mailen må sendes ÉN gang. Bruges KUN til at skelne klar_til_mail fra afventer_betaling — fristen regnes fra underskrevet_at, ikke herfra (rettet 2/9). NULL = mailen er ikke sendt, og tokenet er endnu ikke gyldigt.';

-- ── 2. hent_betalingstilbud — betalingssidens opslag (anon-kaldbar) ──
create or replace function public.hent_betalingstilbud(betalingstoken uuid)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select json_build_object(
    'status', case
      -- Samme rækkefølge som afgoerBetalingsfrist: betalt først, så en
      -- betalt virksomhed aldrig ender i en betalingsgren.
      when c.contract_end_date is not null      then 'betalt'
      when bl.prisniveau_oere is null           then 'afventer_pris'
      when bl.betalingsmail_sendt_at is null    then 'klar_til_mail'
      -- Fristen er kontraktens: fra underskriften, ikke fra mailen.
      when (current_date - bl.underskrevet_at::date) > 30
                                                then 'frist_overskredet'
      else 'afventer_betaling'
    end,
    'virksomhed',      c.name,
    'prisniveau_oere', bl.prisniveau_oere,
    -- Fristen som DATO, så siden siger samme dato som mailen: underskriften
    -- + 30. Findes altid — fristen løber fra underskriften, uanset om
    -- mailen er sendt.
    'frist',           (bl.underskrevet_at::date + 30)::text,
    'dage_tilbage',    greatest(0, 30 - (current_date - bl.underskrevet_at::date))
  )
  from public.company_betalingslink bl
  join public.companies c on c.id = bl.company_id
  where bl.token = betalingstoken
  limit 1
$$;

comment on function public.hent_betalingstilbud(uuid) is
  'Betalingssidens opslag. Tokenet er argument, ikke filter. Kaldes af anon, fordi den besoegende endnu ikke har en konto. Returnerer kun status, virksomhedsnavn, prisniveau, frist og dage_tilbage; aldrig mail, CVR, company_id eller beslutninger. Statusnavnene er de samme fem som src/lib/betalingsfrist.ts. Fristen er kontraktens: underskrevet_at + 30 dage (rettet 2/9). De tre betalingsmodeller regnes af src/lib/indgangspris.ts.';

-- ── 3. hent_betalingsdata_til_checkout — checkout-funktionens dom (kun service_role) ──
create or replace function public.hent_betalingsdata_til_checkout(betalingstoken uuid)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select json_build_object(
    'company_id',      c.id,
    'virksomhed',      c.name,
    'kontakt_email',   c.contact_email,
    'prisniveau_oere', bl.prisniveau_oere
  )
  from public.company_betalingslink bl
  join public.companies c on c.id = bl.company_id
  where bl.token = betalingstoken
    -- Betaling er kun tilladt i status afventer_betaling. Betingelserne er
    -- de samme som i hent_betalingstilbud, blot som filter frem for case:
    -- ikke betalt, pris sat, mail sendt, kontraktens frist ikke overskredet.
    and c.contract_end_date is null
    and bl.prisniveau_oere is not null
    and bl.betalingsmail_sendt_at is not null
    and (current_date - bl.underskrevet_at::date) <= 30
    -- Uden en mail kan Stripe ikke sende kvittering, og webhooken kan ikke
    -- sende invitationen. Fejl hoejt frem for at oprette en session der
    -- ender blindt.
    and c.contact_email is not null
    and c.contact_email <> ''
  limit 1
$$;

comment on function public.hent_betalingsdata_til_checkout(uuid) is
  'Checkout-funktionens opslag. KUN service_role. Returnerer company_id, navn, kontaktmail og prisniveau — og kun naar betaling er tilladt (status afventer_betaling). NULL betyder "maa ikke betale", uanset grund. Fristen er kontraktens: underskrevet_at + 30 dage (rettet 2/9). Adskilt fra hent_betalingstilbud, som er anon-kaldbar og derfor aldrig maa give company_id eller mail fra sig.';

-- Rettighederne er uændrede fra 20260902090000 og 20260902120000; create or
-- replace bevarer dem. Gentaget her, så filen alene kan genskabe laget.
revoke all on function public.hent_betalingstilbud(uuid) from public;
grant execute on function public.hent_betalingstilbud(uuid) to anon;
grant execute on function public.hent_betalingstilbud(uuid) to authenticated;
grant execute on function public.hent_betalingstilbud(uuid) to service_role;

revoke all on function public.hent_betalingsdata_til_checkout(uuid) from public;
revoke all on function public.hent_betalingsdata_til_checkout(uuid) from anon;
revoke all on function public.hent_betalingsdata_til_checkout(uuid) from authenticated;
grant execute on function public.hent_betalingsdata_til_checkout(uuid) to service_role;
