-- (12) Betalingssiden efter fristen — «Vi har sendt fakturaen» KUN når den
-- er sendt, med dato og link (DE TYVE (12); docs/OVERLEVERING.md DEL 2
-- «16. september (nat)» §6; recon-fakturateksten.md, recon-betal-efter-fristen.md).
--
-- FEJLEN: /betal (src/pages/Betal.tsx, gren 6) siger «Vi har sendt en faktura
-- på det fulde beløb …» ud fra status 'frist_overskredet', som denne funktion
-- regner af DAGE siden underskrift (> 30) — fra kl. 00:00 UTC = 02:00 dansk på
-- dag 31. Cronen indgangs-paamindelser (cron.job '0 10 * * *' UTC, målt aktiv
-- 16/9 13:57:35) sender først fakturaen kl. 12:00 dansk. I ti timer siger siden
-- at vi har sendt noget vi ikke har sendt; fejler fakturamotoren, i længere.
-- Stemplet FINDES (company_betalingslink.faktura_sendt_at, 20260903130000),
-- men funktionen returnerer det ikke, og fakturalinket (Stripes
-- hosted_invoice_url) læses af send-svaret i _shared/indgangsFaktura.ts:395
-- og kasseres — ingen kolonne bærer det.
--
-- JONAS' BESLUTNING 16/9 (docs/OVERLEVERING.md:8167, ordret): «Vi skal bygge
-- det bedste» til chattens anbefaling = grønt lys til DEFINER-ændringen: ny
-- kolonne til linket skrevet sammen med faktura_sendt_at; hent_betalingstilbud
-- udvides med «sendt den» og linket; siden siger før afsendelse «Fristen udløb
-- {frist}. Du får en faktura på det fulde beløb.» og efter «Vi har sendt
-- fakturaen på mail den {dato}» + knap «Betal fakturaen» — mailadressen
-- ALDRIG på siden (chattens beslutning).
-- Chattens valg 16/9: faktura_sendt_den = faktura_sendt_at::date::text (UTC-
-- dato, symmetrisk med 'frist', ingen new Date() på siden); faktura_url skæres
-- IKKE til efter status (NULL før afsendelse er reglen); rådgiverens
-- «Faktura»-link på virksomhedssiden er IKKE med; «Pladsen står stadig klar
-- til dig.» sidst i begge tekster. RÆKKEFØLGE: merge → denne migration i SQL
-- editor (FØR-målingen igen først) → indgangs-paamindelser-cron udrulles
-- EKSPLICIT (dens UPDATE skriver faktura_url; før migrationen fejler
-- stemplet på en ukendt kolonne) → Update-klik for frontenden.
--
-- HVAD ÆNDRES: (1) én ny kolonne, faktura_url, skrevet i SAMME UPDATE som
-- faktura_sendt_at (stemplFaktura, _shared/indgangsFaktura.ts) — kun når
-- fakturaen ER sendt fra Stripe; (2) hent_betalingstilbud får to felter i
-- json_build_object: 'faktura_sendt_den' og 'faktura_url'. Status-CASE'n,
-- 'frist', 'dage_tilbage', hovedet (sql, stable, SECURITY DEFINER,
-- search_path public), token-filtret og grants er UÆNDREDE. «betalt» dømmes
-- stadig på + 1 > now() (døren, 20260911050000) — låst igen i DENNE fil af
-- src/lib/__tests__/betalEfterFristen.guard.test.ts, fordi den fil der kører
-- sidst er den der gælder.
--
-- SIKKERHED (CLAUDE.md: SECURITY DEFINER er FORBIDDEN uden grønt lys — givet
-- 16/9, citeret ovenfor). Kaldes af anon (den besøgende har ingen konto);
-- tokenet (122 bits) er argument, ikke filter (20260902090000:4-8). Det nye
-- er HVAD den der har tokenet får: Stripes hostede fakturaside — selv en
-- bæreradgang (egen hemmelighed i URL'en), som Stripe sender til samme
-- contact_email som tokenet. Samme kreds, samme handling (betale). Der
-- returneres STADIG aldrig mail, CVR, company_id eller beslutninger;
-- hent_betalingsdata_til_checkout (service_role) er urørt.
-- supabase/SECURITY_BASELINE.md §1 opdateret i samme PR.
--
-- FØR (prod målt 16/9 13:57:35 dansk, SQL editor):
--   md5(pg_get_functiondef('public.hent_betalingstilbud(uuid)'::regprocedure))
--     = 3529d05e158a71873a6791f5cd08b0c5  (= 20260911050000's krop, målt 11/9)
--   prosecdef = true; proconfig = {search_path=public}; «+ 1 > now()» = true
--   routine_privileges EXECUTE: anon, authenticated, postgres,
--     sandbox_exec_loiavmastgeieqyiwyyr, service_role
--     (postgres er ejer; sandbox_exec_… er Lovables — begge røres ikke:
--     REVOKE … FROM public rammer kun PUBLIC-rollen)
--   company_betalingslink: tolv kolonner, ingen faktura_url
--   rækker med faktura_invoice_id: 0  (ingen skal have linket sat i hånden)
--   cron.job 'indgangs-paamindelser': '0 10 * * *', active = true
-- KRÆVER PROD FØR KØRSEL: kør FØR-målingen igen; afviger md5'en fra
-- 3529d05e…, så kopiér kroppen fra prod (20260907141500-lærdommen), ikke
-- fra denne fil.
--
-- EFTER (kør med det samme, bogfør md5'en her):
--   SELECT md5(pg_get_functiondef('public.hent_betalingstilbud(uuid)'::regprocedure)),
--          pg_get_functiondef('public.hent_betalingstilbud(uuid)'::regprocedure);
--   SELECT proname, prosecdef, proconfig FROM pg_proc
--    WHERE oid = 'public.hent_betalingstilbud(uuid)'::regprocedure;
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--    WHERE routine_name = 'hent_betalingstilbud' ORDER BY grantee;
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'company_betalingslink' AND column_name = 'faktura_url';
--   -- svaret bærer de to nye nøgler (NULL før dag 31):
--   SELECT public.hent_betalingstilbud(bl.token) FROM public.company_betalingslink bl LIMIT 1;
-- DEREFTER, i denne rækkefølge: (1) indgangs-paamindelser-cron udrulles
-- EKSPLICIT i Lovable (verificér «View code»: stemplFaktura skriver
-- faktura_url) — dens UPDATE rammer den nye kolonne, og kører den nye kode
-- før migrationen, fejler stemplet (kaster ikke; logges KRITISK, lag 2
-- fanger det næste dag); (2) Update-klik for frontenden (Betal.tsx læser de
-- to nye felter; den gamle side ignorerer dem).
-- BEVIS i drift: første dag 31-kørsel efter kørsel af denne fil — rækken får
-- faktura_url sammen med faktura_sendt_at, og /betal viser «Vi har sendt
-- fakturaen på mail den … Pladsen står stadig klar til dig.» + «Betal fakturaen».
-- Revert: DROP COLUMN faktura_url; kør 20260911050000's
-- hent_betalingstilbud igen (frontend tåler manglende felter: «Du får en
-- faktura …»).
--
-- IKKE KØRT. DEPLOY: manuelt i Lovable -> SQL editor efter merge — FØR
-- indgangs-paamindelser-cron udrulles eksplicit og FØR Update-klikket
-- (chattens rækkefølge 16/9: merge → migration → cron → Update).

-- ── 1. Kolonnen — sammen med faktura_sendt_at ────────────────────────────
alter table public.company_betalingslink
  add column if not exists faktura_url text;

comment on column public.company_betalingslink.faktura_url is
  'Stripes hosted_invoice_url for dag 31-fakturaen — skrives SAMMEN med faktura_sendt_at i _shared/indgangsFaktura.ts (stemplFaktura), kun naar fakturaen er sendt fra Stripe. NULL = ingen faktura sendt, eller Stripe gav intet link. Vises paa /betal som knappen «Betal fakturaen» via hent_betalingstilbud. Linket udloeber hos Stripe 30 dage efter forfald (hoejst 120).';

-- ── 2. hent_betalingstilbud — to felter mere, alt andet ordret som 20260911050000 ──
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
    'dage_tilbage',    greatest(0, 30 - (current_date - bl.underskrevet_at::date)),
    -- (12) 16/9: hvornår dag 31-fakturaen blev sendt (Stripes finalized_at,
    -- stemplet af _shared/indgangsFaktura.ts) som UTC-dato — samme form som
    -- 'frist'. NULL = ikke sendt endnu: siden siger «Du får en faktura».
    'faktura_sendt_den', bl.faktura_sendt_at::date::text,
    -- Stripes hostede fakturaside — knappen «Betal fakturaen». NULL før
    -- afsendelse. Skæres bevidst IKKE til efter status (chattens valg 16/9).
    'faktura_url',       bl.faktura_url
  )
  from public.company_betalingslink bl
  join public.companies c on c.id = bl.company_id
  where bl.token = betalingstoken
  limit 1
$$;

comment on function public.hent_betalingstilbud(uuid) is
  'Betalingssidens opslag. Tokenet er argument, ikke filter. Kaldes af anon, fordi den besoegende endnu ikke har en konto. Returnerer status, virksomhedsnavn, prisniveau, frist, dage_tilbage, faktura_sendt_den og faktura_url (16/9, Jonas: «Vi skal bygge det bedste»); aldrig mail, CVR, company_id eller beslutninger. Fakturalinket er Stripes hostede fakturaside — selv en baereradgang — og gives kun til den der har tokenet. Statusnavnene er de samme fem som src/lib/betalingsfrist.ts. Fristen er kontraktens: underskrevet_at + 30 dage (rettet 2/9). De tre betalingsmodeller regnes af src/lib/indgangspris.ts.';

-- Rettighederne er uændrede fra 20260902090000/20260902140000; create or
-- replace bevarer dem. Gentaget her, så filen alene kan genskabe laget.
revoke all on function public.hent_betalingstilbud(uuid) from public;
grant execute on function public.hent_betalingstilbud(uuid) to anon;
grant execute on function public.hent_betalingstilbud(uuid) to authenticated;
grant execute on function public.hent_betalingstilbud(uuid) to service_role;
