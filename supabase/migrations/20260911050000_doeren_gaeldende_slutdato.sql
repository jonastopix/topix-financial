-- Migration: døren — «betalt» dømmes på at contract_end_date GÆLDER, ikke
-- at den FINDES. Rettet 11/9 2026 (recon-doeren.md; fundet af det tredje
-- vindues kortgennemgang 10/9).
--
-- FEJLEN: hent_betalingstilbud (siden /betal) sagde 'betalt' når
-- c.contract_end_date IS NOT NULL, og hent_betalingsdata_til_checkout
-- (bag verifyBetalingstoken) tillod kun checkout når den var NULL. En
-- tidligere kunde bærer sin gamle slutdato med sig: genbruges virksomheden
-- på CVR ved «Godkendt», sagde siden «Tak — du er inde» til en der ikke
-- havde betalt, og checkout afviste tavst (NULL røber ingen grund). De fire
-- andre døre (afgoerBetalingsfrist i begge spejle, indgangsFaktura,
-- påmindelsescronens filter) er rettet i samme PR i TypeScript.
--
-- DET RAMMER INGEN I DAG — indgangen har aldrig haft en kunde (nul rækker i
-- company_betalingslink 7/9), og de otte tidligere er slettet 8/9. Men det
-- rammer den FØRSTE der kommer tilbage: de kan ikke betale — og retter man
-- kun siden, kan de se knappen og STADIG ikke betale. Derfor begge her.
--
-- DOMMEN er husets egen (computeMembershipTier, har_aktivt_medlemskab,
-- 20260907141500): slutdagen tæller med, lukket fra kl. 00:00 UTC dagen
-- efter — `contract_end_date + 1 > now()`. Sessionens tidszone er UTC
-- (målt 7/9). NULL er ikke betalt (uændret): `NULL + 1 > now()` er NULL,
-- og NULL er ikke sandt i et CASE og ikke sandt i et WHERE.
--   slutdato i går   → ikke betalt (var medlem; kan betale)
--   slutdato i dag   → betalt (til og med slutdagen)
--   slutdato i morgen → betalt
--   NULL             → ikke betalt (som før)
-- Spejlet ORDRET af erGaeldendeSlutdato i _shared/betalingsfrist.ts og
-- låst af src/lib/__tests__/doeren.guard.test.ts, som læser DENNE fil.
--
-- BEGGE FUNKTIONER er SECURITY DEFINER (FORBIDDEN-listen i CLAUDE.md —
-- kræver grønt lys, og det er givet: opgaven 11/9). Kroppene er kopieret
-- fra 20260902140000_frist_fra_underskrift.sql med ÉN linje ændret i hver.
-- KRÆVER PROD FØR KØRSEL: bekræft at prods kroppe ER repoets —
--   SELECT pg_get_functiondef('public.hent_betalingstilbud'::regproc);
--   SELECT pg_get_functiondef('public.hent_betalingsdata_til_checkout'::regproc);
-- (20260907141500-lærdommen: kopiér fra prod, ikke fra filerne, hvis de
-- afviger.)
--
-- BEVIS efter kørsel (kræver en linkrække — tørt: ingen i dag):
--   SELECT c.name, c.contract_end_date, public.hent_betalingstilbud(bl.token)->>'status'
--   FROM public.company_betalingslink bl JOIN public.companies c ON c.id = bl.company_id;
-- Revert: kør 20260902140000's to CREATE OR REPLACE igen.
--
-- IKKE KØRT. DEPLOY: manuelt i Lovable -> SQL editor efter merge.

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
      -- betalt virksomhed aldrig ender i en betalingsgren. Betalt = en
      -- slutdato der GÆLDER (11/9): slutdagen tæller med, + 1 > now().
      when c.contract_end_date is not null
       and c.contract_end_date + 1 > now()       then 'betalt'
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
    -- Ikke betalt = ingen slutdato, ELLER en slutdato der er passeret (11/9):
    -- en tidligere kunde må købe sig ind igen.
    and (c.contract_end_date is null or c.contract_end_date + 1 <= now())
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
