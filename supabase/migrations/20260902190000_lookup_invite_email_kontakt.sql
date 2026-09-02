-- Adgangsrejsen, trin 1: invitationsopslaget giver mail og navn.
-- Skrevet 2/9; køres MANUELT i Lovable -> SQL editor (CLAUDE.md —
-- migrationer auto-deployer aldrig). Denne fil er bogføringen.
--
-- HVORFOR: /auth?invite=<token> kalder lookup_invite_company_info og fik
-- kun virksomhedens navn og logo. Mailfeltet stod tomt, og det er
-- hovedgrunden til at rejsen var otte skridt: et nyt medlem skulle taste
-- den mail vi lige havde sendt invitationen til — og skrev de en anden,
-- matchede triggeren (handle_new_user) ingen invitation og afviste signup
-- med RAISE EXCEPTION P0001. Nu returnerer opslaget også:
--   'email'   ci.email          — invitationens modtager
--   'kontakt' c.contact_person  — kan være NULL
--
-- HVEM FÅR MAILEN AT SE: kun den der allerede har tokenet. Tokenet er
-- 122 bits (gen_random_uuid) og kan ikke gættes — samme klasse som
-- betalingslinket, hvis opslag (hent_betalingstilbud) giver
-- virksomhedsnavn og prisniveau fra sig. Og det er modtagerens EGEN
-- adresse: den mail invitationen blev sendt til. Tokenet er argument, ikke
-- filter (RLS er rækkeniveau og kan ikke se URL'en — lærdommen fra
-- 20260225103928), og kun status = 'pending' svarer.
--
-- contact_person er TOM for alt der ikke er oprettet af monday-webhook
-- efter 2/9: import-application skriver contact_name i
-- application_context, ikke i contact_person. RETTET 2/9 aften: en
-- tidligere version af denne kommentar sagde «ER NULL». Kolonnen har
-- DEFAULT '' (20260225104718), og målt i prod 2/9 kl. 20:10 stod 35 af
-- 39 med tom streng og 1 med NULL. Fladen SKAL tåle BÅDE null og tom
-- streng og falde tilbage på et redigerbart navnefelt — Auth.tsx gør
-- `?? ""` + trim(), så de to behandles ens. Bogført i
-- docs/indgangsfladen-design.md §10 og docs/indgangen-design.md §32.
--
-- GRANTS: funktionen havde ingen eksplicitte og hvilede på Supabases
-- default (målt 27/5: anon + authenticated + service_role). De sættes nu
-- eksplicit, med samme begrundelse som hent_betalingstilbud: den
-- besøgende har ingen konto endnu, så anon SKAL kunne kalde den. Bevidst
-- undtagelse fra husets mønster (REVOKE FROM anon) — tokenet er
-- beskyttelsen.
--
-- Alt andet er ORDRET som 20260310210323: SECURITY DEFINER, STABLE, låst
-- search_path, status = 'pending', LIMIT 1. Returtypen (json) er uændret,
-- så CREATE OR REPLACE er tilladt.
--
-- Verificér efter kørsel:
--   SELECT pg_get_functiondef('public.lookup_invite_company_info(uuid)'::regprocedure);
--   SELECT public.lookup_invite_company_info('<et pending-token>');

CREATE OR REPLACE FUNCTION public.lookup_invite_company_info(invite_token uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'name', c.name,
    'logo_url', c.logo_url,
    'email', ci.email,
    'kontakt', c.contact_person
  )
  FROM public.company_invitations ci
  JOIN public.companies c ON c.id = ci.company_id
  WHERE ci.token = invite_token AND ci.status = 'pending'
  LIMIT 1
$$;

COMMENT ON FUNCTION public.lookup_invite_company_info(uuid) IS
  'Signup-sidens opslag på et invitationstoken. Tokenet er argument, ikke filter. Kaldes af anon, fordi den besoegende endnu ikke har en konto. Returnerer virksomhedens navn og logo, invitationens e-mail (modtagerens egen) og companies.contact_person (kan vaere NULL). Kun pending-invitationer svarer. Udvidet 2/9 med email + kontakt saa /auth kan forudfylde.';

REVOKE ALL ON FUNCTION public.lookup_invite_company_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_invite_company_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_invite_company_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_invite_company_info(uuid) TO service_role;
