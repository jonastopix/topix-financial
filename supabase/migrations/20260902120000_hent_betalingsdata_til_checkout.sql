-- Checkout-funktionens opslag. KOERT MANUELT i Lovable SQL editor 2026-09-02
-- og bevist samme dag i tre tilfaelde (ukendt token -> null, manglende
-- contact_email -> null, alt paa plads -> fire felter). Denne fil er
-- bogfoeringen; uden den kan laget ikke genskabes fra repoet.
--
-- KUN service_role. Adskilt fra hent_betalingstilbud (20260902090000), som
-- er anon-kaldbar og derfor ALDRIG maa give company_id eller mail fra sig.
-- Denne maa, fordi kun service_role kan kalde den — og
-- _shared/betalingstokenAuth.ts er det eneste sted der goer det.
--
-- DOMMEN LIGGER HER, ikke i edge-funktionen: null betyder "maa ikke betale",
-- uanset om det skyldes et ukendt token, en manglende pris, en manglende
-- mail eller en overskredet frist. opret-indgangs-checkout svarer 403 paa
-- null og behoever ikke kende grundene. Samme princip som at
-- opret-fornyelse-checkout kun accepterer status udloebet_tilbyd.

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
    -- ikke betalt, pris sat, mail sendt, frist ikke overskredet.
    and c.contract_end_date is null
    and bl.prisniveau_oere is not null
    and bl.betalingsmail_sendt_at is not null
    and (current_date - bl.betalingsmail_sendt_at::date) <= 30
    -- Uden en mail kan Stripe ikke sende kvittering, og webhooken kan ikke
    -- sende invitationen. Fejl hoejt frem for at oprette en session der
    -- ender blindt.
    and c.contact_email is not null
    and c.contact_email <> ''
  limit 1
$$;

comment on function public.hent_betalingsdata_til_checkout(uuid) is
  'Checkout-funktionens opslag. KUN service_role. Returnerer company_id, navn, kontaktmail og prisniveau — og kun naar betaling er tilladt (status afventer_betaling). NULL betyder "maa ikke betale", uanset grund. Adskilt fra hent_betalingstilbud, som er anon-kaldbar og derfor aldrig maa give company_id eller mail fra sig.';

revoke all on function public.hent_betalingsdata_til_checkout(uuid) from public;
revoke all on function public.hent_betalingsdata_til_checkout(uuid) from anon;
revoke all on function public.hent_betalingsdata_til_checkout(uuid) from authenticated;
grant execute on function public.hent_betalingsdata_til_checkout(uuid) to service_role;
