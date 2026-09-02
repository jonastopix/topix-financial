-- Betalingssidens opslag. KØRT MANUELT i Lovable SQL editor 2026-09-02.
-- Bevist i produktion samme dag i alle fem tilstande.
--
-- Tokenet er ARGUMENT, ikke filter: RLS er rækkeniveau og kan ikke se hvad
-- der stod i URL'en, så en politik der tillod opslag "på token" ville give
-- adgang til ALLE rækker. Opdaget og droppet 44 sekunder efter oprettelsen
-- 25/2 (migration 20260225103928). lookup_invite_company_info er husets
-- svar; denne følger samme form.
--
-- Hvorfor SQL og ikke en edge function: kalderen har INGEN session —
-- personen har ikke en konto endnu. Målt 2/9: authenticateUser afviser en
-- anon-nøgle, fordi den ingen sub-claim har, og ingen eksisterende Bucket
-- A-funktion kan tage imod en sessionsløs kalder. PostgREST tillader
-- derimod anon at kalde en SECURITY DEFINER-funktion når EXECUTE er givet.
--
-- Returnerer KUN status, virksomhedsnavn, prisniveau og frist. IKKE mail,
-- IKKE CVR, IKKE company_id, IKKE beslutninger. De tre betalingsmodeller
-- regnes af src/lib/indgangspris.ts — SQL kan ikke importere en
-- TypeScript-motor, og reglen må ikke duplikeres her. Det beløb der
-- TRÆKKES, slås op i Stripe på lookup_key serverside i checkout, så det
-- viste og det opkrævede ikke kan skride fra hinanden.
--
-- Statusnavnene er de samme fem som src/lib/betalingsfrist.ts.
-- Fravær af række giver NULL, som fladen viser som "ukendt link".

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
      when (current_date - bl.betalingsmail_sendt_at::date) > 30
                                                then 'frist_overskredet'
      else 'afventer_betaling'
    end,
    'virksomhed',      c.name,
    'prisniveau_oere', bl.prisniveau_oere,
    -- Fristen som DATO, så siden siger samme dato som mailen.
    -- NULL når mailen ikke er sendt — der er ingen frist endnu.
    'frist', case
      when bl.betalingsmail_sendt_at is null then null
      else (bl.betalingsmail_sendt_at::date + 30)::text
    end,
    'dage_tilbage', case
      when bl.betalingsmail_sendt_at is null then null
      else greatest(0, 30 - (current_date - bl.betalingsmail_sendt_at::date))
    end
  )
  from public.company_betalingslink bl
  join public.companies c on c.id = bl.company_id
  where bl.token = betalingstoken
  limit 1
$$;

comment on function public.hent_betalingstilbud(uuid) is
  'Betalingssidens opslag. Tokenet er argument, ikke filter. Kaldes af anon, fordi den besoegende endnu ikke har en konto. Returnerer kun status, virksomhedsnavn, prisniveau og frist; aldrig mail, CVR, company_id eller beslutninger. Statusnavnene er de samme fem som src/lib/betalingsfrist.ts. De tre betalingsmodeller regnes af src/lib/indgangspris.ts.';

-- EXECUTE eksplicit. anon SKAL kunne kalde den: den besoegende har ingen
-- konto. Bevidst undtagelse fra husets moenster (REVOKE FROM anon) —
-- tokenet er beskyttelsen: 122 bits, kan ikke gaettes, og svaret baerer
-- intet der kan bruges til noget uden det.
revoke all on function public.hent_betalingstilbud(uuid) from public;
grant execute on function public.hent_betalingstilbud(uuid) to anon;
grant execute on function public.hent_betalingstilbud(uuid) to authenticated;
grant execute on function public.hent_betalingstilbud(uuid) to service_role;
