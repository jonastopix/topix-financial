-- KØRT i prod 2/10-2026 ca. 12:20 (Claude via Lovable-MCP, Jonas' grønne lys «Klar» 11:31). FØR: de fem prod-kroppe logisk lig kildefilerne (kun kommentarer afveg — prod-kopien er gemt i chatten/scratchpad), politikker 16, gæster 0. EFTER: dom 1 (definer+stable+search_path), fem porte «false / true», skrivevejene urørte, politikker 16, læsere 27/27. RLS-prøve (rullet tilbage): medlem true/11 tråde/feed 5, udløbet false/0/0.
--
-- GÆSTEN LÆSER COMMUNITY, SKRIVER IKKE — en NY LÆSE-DOM (Jonas, morgenlisten
-- 2/10-2026: «Gæsten læser, skriver ikke (ny læse-dom)»; beslutningen 14/9:
-- «En gæst ser Community, men skriver ikke»; mangellistens w13, mulighed 2 af
-- de tre fra 2/10 nat; docs/adgangsdomme.md «7. Den sjette dom»).
--
-- HVORFOR DEN KRÆVER GRØNT LYS: den opretter en SECURITY DEFINER-funktion
-- (kan_laese_community) og erstatter kroppen i FEM eksisterende SECURITY
-- DEFINER-RPC'er + to RLS-politikker (DROP + CREATE med samme navn; begrundelse
-- herunder). Første linje er med vilje IKKE «IKKE KØRT. DEPLOY:» — den, der
-- scanner mappen efter migrationer at køre, skal ikke tage denne med uden
-- Jonas' ja.
--
-- HVAD «GÆST» ER — MÅLT I KODEN OG DOKUMENTATIONEN 2/10-2026 (entydigt):
--   companies.vis_i_netvaerk = false. Kolonnen blev lavet TIL gæster
--   (20260902110000_gaest_i_netvaerk: «Til gaester der har faaet lov at se
--   platformen uden at vaere medlemmer»); rådgiverens formular kalder feltet
--   «Gæst — har adgang til platformen, men vises ikke i Netværket»
--   (EditCompanyDialog.tsx); Jonas 14/9: «de to er GÆSTER» om præcis de to
--   virksomheder, der bærer flaget; Klaviyo-medlemsdommen (_shared/klaviyoMedlem.ts)
--   og stilleDom.erIGrundmaengden bruger samme felt som «gæst». Der findes INGEN
--   anden markør (ingen rolle, ingen status-værdi, ingen enrollment).
--   En gæst i den tilstand, Jonas besluttede for, har INGEN slutdato
--   (contract_end_date IS NULL — det er præcis derfor har_aktivt_medlemskab
--   siger nej, og listen i dag er tom; mangellistens recon 1/10 aften). Flaget
--   bruges OGSÅ på en fuld testvirksomhed med kontrakt for at holde den ude af
--   Netværket (OVERLEVERING «16/9», SKÆRMBEVIS) — den læser allerede gennem
--   har_aktivt_medlemskab og rammes ikke af den nye gren.
--
-- DOMMEN kan_laese_community(uid) = har_aktivt_medlemskab(uid)
--   OR EXISTS (medlemskab i en virksomhed med vis_i_netvaerk = false
--              AND is_legat = false AND contract_end_date IS NULL
--              AND is_demo IS DISTINCT FROM true AND data_slettet_at IS NULL).
--   DEMO OG SLETTET (rådets fund 2/10): en demovirksomhed (is_demo = true) og en
--   slettet (data_slettet_at sat) er ingen gæst, selv med flaget og uden slutdato —
--   samme udelukkelse som klaviyoMedlem/trofaeer/kvartalstjek-universet. is_demo
--   NULL tæller som «ikke demo» (IS DISTINCT FROM true), som i klientens spejl.
--   er_kunde (MÅLT I KODEN 2/10): bruges KUN i tællinger og lister (online.ts,
--   kohorte.ts, kvartalstjekOverblik, VirksomhedslisteView, AdvisorDashboard,
--   ansoegninger, klaviyoMedlem) — ALDRIG i en adgangsdom (har_aktivt_medlemskab,
--   is_membership_active, computeMembershipTier læser den ikke). Den er husets
--   «egen virksomhed» (Topix.dk ApS, testkontoen), ikke en gæstemarkør. Gæstegrenen
--   tager den derfor IKKE med: læseadgang er en adgangsdom, og at lægge er_kunde
--   ind her ville gøre den til den eneste dom, der læser feltet.
--   VALGT (det snævre): gæstegrenen kræver BÅDE flaget OG «ingen slutdato».
--   Flaget alene ville give læseadgang til en UDLØBET virksomhed, der er sat som
--   gæst (en tidligere kunde skjult fra Netværket — ikke en gæst); «ingen
--   slutdato» alene var mulighed (b) fra 1/10, som Jonas' liste pegede på, men
--   som også ville have givet ALLE uden slutdato adgang og blev stoppet 2/10 nat.
--   Snittet af de to er den tilstand, Jonas besluttede for 14/9. is_legat = false
--   som i har_aktivt_medlemskab (legat har sit eget miljø). Et udløbet
--   gæsteflag → ingen læsning (fail-closed); ønsker Jonas det bredere, er det én
--   linje her og i klientens spejl (src/lib/hjemmebane/communityAdgang.ts).
--
-- SANDHEDSTABEL (R = kan læse community, S = kan skrive; rådgiver via has_role er altid R+S og står ikke i tabellen):
--   vis_i_netvaerk | is_legat | contract_end_date      | har_aktivt_medlemskab | kan_laese_community | S (uændret) | hvem
--   true           | false    | sat, ikke passeret     | true                  | true                | ja          | fuldt medlem
--   true           | false    | sat, passeret          | false                 | false               | nej         | udløbet (App.tsx sender tier expired væk)
--   true           | false    | NULL                   | false                 | false               | nej         | «no_date» uden gæsteflag — som i dag (mulighed (b) var dette: afvist)
--   false          | false    | NULL (ikke demo, ikke slettet) | false         | TRUE  ← ny          | nej         | GÆSTEN (Jonas 14/9)
--   false          | false    | sat, ikke passeret     | true                  | true                | ja          | fuldt medlem skjult fra Netværket (testvirksomhed)
--   false          | false    | sat, passeret          | false                 | false               | nej         | udløbet + gæsteflag: IKKE en gæst (valgt snævert)
--   false          | false    | NULL  + is_demo = true | false                 | false               | nej         | demo — ingen gæst (fund 2/10)
--   false          | false    | NULL  + data_slettet_at| false                 | false               | nej         | slettet — ingen gæst (fund 2/10)
--   (alt)          | true     | (alt)                  | false                 | false               | nej         | legat — eget miljø
--   intet medlemskab                                   | false                 | false               | nej         | ingen virksomhed
--   Selvbetjeningsabonnent (subscription_status) vurderes IKKE — som i har_aktivt_medlemskab (abonnementet dækker ikke community).
--
-- HVOR DEN NYE DOM BRUGES — KUN LÆSNING:
--   RLS SELECT  «Members can view active threads»  (community_traade)  har_aktivt_medlemskab → kan_laese_community
--   RLS SELECT  «Members can view active replies»  (community_svar)    har_aktivt_medlemskab → kan_laese_community
--   RPC         get_community_feed · get_community_traad · get_community_svar   (porten først i kroppen)
--   RPC         maa_se_community_billede · maa_se_community_fil                 (edge-funktionernes port før signering)
-- HVAD DER BEVIDST IKKE RØRES (skrivning og alt, der mailer):
--   RLS INSERT/UPDATE på community_traade/community_svar, INSERT på community_reaktioner og
--   community_visninger; RPC'erne opret_community_traad, opret_community_svar, ret_*, slet_*,
--   skjul_community_traad, saet_community_reaktion — alle på har_aktivt_medlemskab (RAISE «Ingen adgang
--   til community»; klienten viser gæsten grænsen i stedet for at kalde dem).
--   registrer_community_visning: UÆNDRET (har_aktivt_medlemskab) — en visningsrække ER en skrivning, og
--   «gæsten skriver ikke» tages bogstaveligt: gæstens kig tæller ikke i «set af N» (stille RETURN, som i
--   dag). Kan åbnes senere ved at bytte porten (én linje) — bogført som valg.
--   get_community_medlemmer: UÆNDRET — dens resultatsæt er IKKE kun @-pickeren, det er MODTAGERLISTEN for
--   opslagsmailen (notify-community-opslag, samlemail) og «hvem må nævnes» (notify-community-naevnelse).
--   At udvide den ville MAILE gæster ved hvert opslag (Jonas 22/9: ingen overmailing). Porten (hvem må kalde
--   den) står også på har_aktivt_medlemskab — gæsten ser ingen composer og behøver ingen picker; den
--   højre spalte «Medlemmer» viser gæsten en tom liste (CommunityMedlemmer er fail-soft på tom).
--   Storage-politikkerne på community-billeder/-filer (upload/delete own) — skrivning.
--
-- FØR KØRSEL (ufravigeligt — kroppene herunder er bygget på migrationsfilerne, IKKE på prod,
-- fordi denne session ikke kan læse prod): sammenlign HVER af de fem RPC-kroppe og de to
-- politikker med prod. Afviger ÉN, STOP — kør intet, og skriv afvigelsen i
-- docs/adgangsdomme.md «7. Den sjette dom», før migrationen skrives om på prods grundlag.
--   SELECT pg_get_functiondef('public.get_community_feed(int, int)'::regprocedure);     -- forventet: 20260812180000:36-108
--   SELECT pg_get_functiondef('public.get_community_traad(uuid)'::regprocedure);        -- forventet: 20260812180000:117-182
--   SELECT pg_get_functiondef('public.get_community_svar(uuid)'::regprocedure);         -- forventet: 20260812180000:191-244
--   SELECT pg_get_functiondef('public.maa_se_community_billede(uuid, text)'::regprocedure); -- forventet: 20260812110000:20-77
--   SELECT pg_get_functiondef('public.maa_se_community_fil(uuid, text)'::regprocedure);     -- forventet: 20260812140000:24-82
--   SELECT pg_get_functiondef('public.har_aktivt_medlemskab(uuid)'::regprocedure);      -- forventet: 20260907141500:43-61 (RØRES IKKE — den kaldes)
--   SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
--     FROM pg_policy WHERE polrelid IN ('public.community_traade'::regclass, 'public.community_svar'::regclass) ORDER BY 1;
--     -- forventet: «Members can view active threads» SELECT PERMISSIVE USING ((status = 'aktiv') AND har_aktivt_medlemskab(auth.uid()));
--     --            «Members can view active replies» samme form; de øvrige som 20260811140000/20260811160000.
--   De forventede kroppe er, hvad denne fil erstatter ÉT led i (porten). Alt andet i hver krop er
--   tegn for tegn som migrationsfilen — det er præcis det, sammenligningen skal bekræfte.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 dom findes' as sektion, count(*)::text as vaerdi from pg_proc where proname = 'kan_laese_community'
--   union all
--   select '2 porte i rpc ' || p.proname, (position('har_aktivt_medlemskab' in pg_get_functiondef(p.oid)) > 0)::text || ' / ' || (position('kan_laese_community' in pg_get_functiondef(p.oid)) > 0)::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('get_community_feed','get_community_traad','get_community_svar','maa_se_community_billede','maa_se_community_fil','registrer_community_visning','get_community_medlemmer','opret_community_traad','opret_community_svar','saet_community_reaktion')
--   union all
--   select '3 politik ' || polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid in ('public.community_traade'::regclass, 'public.community_svar'::regclass) and polcmd = 'r'
--   union all
--   select '4 gaester (flag, ingen slutdato, ikke legat/demo/slettet)', count(*)::text from public.companies where vis_i_netvaerk = false and contract_end_date is null and is_legat = false and is_demo is distinct from true and data_slettet_at is null
--   union all
--   select '5 flag + udloebet (faar IKKE adgang)', count(*)::text from public.companies where vis_i_netvaerk = false and contract_end_date is not null and contract_end_date + 1 <= now()
--   union all
--   select '6 flag + aktiv kontrakt (laeser allerede)', count(*)::text from public.companies where vis_i_netvaerk = false and contract_end_date is not null and contract_end_date + 1 > now()
--   union all
--   select '7 brugere der faar laeseadgang af den nye gren', count(distinct cm.user_id)::text
--     from public.company_members cm join public.companies c on c.id = cm.company_id
--    where c.vis_i_netvaerk = false and c.contract_end_date is null and c.is_legat = false and c.is_demo is distinct from true and c.data_slettet_at is null and not public.har_aktivt_medlemskab(cm.user_id)
--   order by 1;
--   Forventet: 1 = 0; 2 = «true / false» for alle ti; 3 = de to SELECT-politikker med har_aktivt_medlemskab;
--   4–7 = TALLENE SKRIVES HER (de to gæster fra 2/9 blev slettet 21/9 — 4 kan være 0; da ændrer migrationen
--   ingen adgang i dag og er klar til den næste gæst). Afviger 2 eller 3 — STOP.
--
-- EFTER-SQL (samme sæt som FØR plus):
--   select '8 dom definer + stable + search_path', (prosecdef and provolatile = 's' and coalesce(array_to_string(proconfig, ','), '') like '%search_path=public%')::text
--     from pg_proc where proname = 'kan_laese_community'
--   union all
--   select '9 dom rettigheder', coalesce((select string_agg(grantee || ':' || privilege_type, ' · ' order by grantee)
--     from information_schema.routine_privileges where specific_schema = 'public' and routine_name = 'kan_laese_community'), 'ingen')
--   union all
--   select '10 politikker community i alt', count(*)::text from pg_policy where polrelid in ('public.community_traade'::regclass, 'public.community_svar'::regclass, 'public.community_reaktioner'::regclass, 'public.community_visninger'::regclass)
--   Forventet: 1 = 1; 2 = «false / true» for feed, traad, svar, billede, fil — og «true / false» for visning,
--   medlemmer, opret_traad, opret_svar, reaktion (UÆNDREDE); 3 = begge med kan_laese_community; 8 = true;
--   9 = authenticated:EXECUTE · service_role:EXECUTE (og ejeren); 10 = 15 (uændret antal: 5+5+3+... tæl FØR, det
--   samme EFTER — ingen politik er kommet til eller forsvundet).
--   RLS-PRØVE (rul tilbage): som en gæstebruger —
--     begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<gæstens uid>","role":"authenticated"}', true);
--     select public.kan_laese_community(auth.uid()), public.har_aktivt_medlemskab(auth.uid());  -- true, false
--     select count(*) from public.community_traade;                                                 -- > 0 (aktive tråde)
--     select count(*) from public.get_community_feed(5, 0);                                         -- > 0
--     select public.opret_community_traad('Prøve', 'Prøve');                                        -- FEJL «Ingen adgang til community»
--     rollback;
--   Findes ingen gæst (sektion 4 = 0): prøven venter til den første; dommen er da målt kun på et fuldt medlem
--   (true/true) og en udløben (false/false).
--
-- ROLLBACK (kun før Update): kør DEL 2 og DEL 3 fra de forventede migrationsfiler igen
-- (20260811160000 DEL 2 for de to politikker; kroppene fra 20260812180000, 20260812110000,
-- 20260812140000) og derefter: drop function if exists public.kan_laese_community(uuid);

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 1: kan_laese_community — den sjette adgangsdom (læsning alene)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kan_laese_community(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.har_aktivt_medlemskab(_user_id)
      OR EXISTS (
           SELECT 1
           FROM public.company_members cm
           JOIN public.companies c ON c.id = cm.company_id
           WHERE cm.user_id = _user_id
             -- Gæsten (Jonas 14/9-2026): flaget, ikke legat, OG ingen slutdato — alle tre.
             AND c.vis_i_netvaerk = false
             AND c.is_legat = false
             AND c.contract_end_date IS NULL
             -- Rådets fund 2/10: en demo- eller slettet virksomhed er ingen gæst.
             AND c.is_demo IS DISTINCT FROM true
             AND c.data_slettet_at IS NULL
         )
$function$;

COMMENT ON FUNCTION public.kan_laese_community(uuid) IS
  'LÆSE-dom for community (2/10-2026, Jonas 14/9 «En gæst ser Community, men skriver ikke»): har_aktivt_medlemskab(uid) ELLER et medlemskab i en gæstevirksomhed (vis_i_netvaerk = false AND is_legat = false AND contract_end_date IS NULL AND is_demo IS DISTINCT FROM true AND data_slettet_at IS NULL). Bruges KUN i SELECT-politikker og læse-RPC''er (feed, tråd, svar, billed-/filport). Skrivning dømmes stadig af har_aktivt_medlemskab. Spejl i klienten: src/lib/hjemmebane/communityAdgang.ts (værn communityGaest.guard).';

REVOKE ALL ON FUNCTION public.kan_laese_community(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kan_laese_community(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.kan_laese_community(uuid) TO authenticated;
-- service_role arver IKKE authenticated-grants (lærdom 10/8, get_member_directory).
GRANT EXECUTE ON FUNCTION public.kan_laese_community(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 2: de to SELECT-politikker — læsning efter den nye dom
-- ─────────────────────────────────────────────────────────────────────────
--
-- DROP POLICY-begrundelse (CLAUDE.md-kravet): CREATE POLICY har ikke OR REPLACE,
-- så hver af de to SELECT-politikker droppes og genskabes med SAMME navn, samme
-- kommando, samme rolle og samme form — kun dommen skifter fra
-- har_aktivt_medlemskab til kan_laese_community. INGEN anden politik røres
-- (INSERT/UPDATE for medlemmer, de fire advisor-politikker, reaktioner, visninger).

DROP POLICY IF EXISTS "Members can view active threads" ON public.community_traade;
CREATE POLICY "Members can view active threads"
  ON public.community_traade FOR SELECT
  TO authenticated
  USING (status = 'aktiv' AND public.kan_laese_community(auth.uid()));

DROP POLICY IF EXISTS "Members can view active replies" ON public.community_svar;
CREATE POLICY "Members can view active replies"
  ON public.community_svar FOR SELECT
  TO authenticated
  USING (status = 'aktiv' AND public.kan_laese_community(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 3: de tre læse-RPC'er — porten først i kroppen skifter dom
-- (kroppene fra 20260812180000 tegn for tegn; KUN porten er ændret)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_community_feed(p_limit int DEFAULT 30, p_offset int DEFAULT 0)
RETURNS TABLE(
  id uuid,
  titel text,
  indhold text,
  indhold_json jsonb,
  status text,
  fastgjort boolean,
  antal_svar integer,
  antal_visninger integer,
  sidste_svar_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  kilde_type text,
  kilde_item_id uuid,
  kilde_event_id uuid,
  forfatter_id uuid,
  forfatter_navn text,
  forfatter_avatar_url text,
  antal_reaktioner bigint,
  jeg_har_reageret boolean,
  seneste_aktivitet_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- SECURITY DEFINER omgår RLS — funktionen SKAL selv håndhæve adgangen.
  -- Uden dette tjek er den en åben dør uden om de netop strammede
  -- community-policies. Tomt resultat, ikke fejl: en udløben bruger skal
  -- se et tomt community, ikke en fejlskærm.
  -- LÆSE-dommen (2/10-2026): kan_laese_community — gæsten læser med.
  IF NOT (public.kan_laese_community(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.titel,
    t.indhold,
    t.indhold_json,
    t.status,
    t.fastgjort,
    t.antal_svar,
    t.antal_visninger,
    t.sidste_svar_at,
    t.created_at,
    t.updated_at,
    t.kilde_type,
    t.kilde_item_id,
    t.kilde_event_id,
    t.forfatter_id,
    p.full_name,
    p.avatar_url,
    (SELECT count(*) FROM public.community_reaktioner r WHERE r.traad_id = t.id),
    EXISTS (SELECT 1 FROM public.community_reaktioner r
            WHERE r.traad_id = t.id AND r.bruger_id = auth.uid()),
    COALESCE(t.sidste_svar_at, t.created_at)
  FROM public.community_traade t
  LEFT JOIN public.profiles p ON p.user_id = t.forfatter_id
  -- Rådgivere ser aktiv OG skjult; medlemmer kun aktiv. 'slettet' vises
  -- aldrig for nogen — et medlems sletning er endelig, kun skjul er
  -- moderation.
  WHERE (t.status = 'aktiv'
         OR (t.status = 'skjult' AND public.has_role(auth.uid(), 'advisor')))
  -- Nøjagtig den kanoniske sortering fra idx_community_traade_feed
  -- (20260811150000): fastgjorte øverst, derefter seneste aktivitet.
  ORDER BY t.fastgjort DESC, COALESCE(t.sidste_svar_at, t.created_at) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_community_feed(int, int) IS
  'Community-feedet: aktive tråde med forfatter (profiles joines i funktionen — medlemmer kan ikke læse andres profiler direkte), reaktionstal og "har jeg reageret". SECURITY DEFINER med eget fail-closed adgangstjek (kan_laese_community eller advisor; 2/10-2026: gæsten læser med) — tomt resultat for alle andre. Rådgivere ser også SKJULTE tråde (moderation kan fortrydes); ''slettet'' vises aldrig for nogen. Sorteringen er den kanoniske fra idx_community_traade_feed. Det strukturerede Tiptap-dokument (indhold_json) følger med ved siden af tekstuddraget.';

CREATE OR REPLACE FUNCTION public.get_community_traad(p_traad_id uuid)
RETURNS TABLE(
  id uuid,
  titel text,
  indhold text,
  indhold_json jsonb,
  status text,
  fastgjort boolean,
  antal_svar integer,
  antal_visninger integer,
  sidste_svar_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  kilde_type text,
  kilde_item_id uuid,
  kilde_event_id uuid,
  forfatter_id uuid,
  forfatter_navn text,
  forfatter_avatar_url text,
  antal_reaktioner bigint,
  jeg_har_reageret boolean,
  seneste_aktivitet_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Samme fail-closed adgangstjek som get_community_feed — SECURITY
  -- DEFINER uden eget tjek er en åben dør uden om policies.
  -- LÆSE-dommen (2/10-2026): kan_laese_community — gæsten læser med.
  IF NOT (public.kan_laese_community(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.titel,
    t.indhold,
    t.indhold_json,
    t.status,
    t.fastgjort,
    t.antal_svar,
    t.antal_visninger,
    t.sidste_svar_at,
    t.created_at,
    t.updated_at,
    t.kilde_type,
    t.kilde_item_id,
    t.kilde_event_id,
    t.forfatter_id,
    p.full_name,
    p.avatar_url,
    (SELECT count(*) FROM public.community_reaktioner r WHERE r.traad_id = t.id),
    EXISTS (SELECT 1 FROM public.community_reaktioner r
            WHERE r.traad_id = t.id AND r.bruger_id = auth.uid()),
    COALESCE(t.sidste_svar_at, t.created_at)
  FROM public.community_traade t
  LEFT JOIN public.profiles p ON p.user_id = t.forfatter_id
  WHERE t.id = p_traad_id
    -- Rådgivere ser aktiv OG skjult; 'slettet' aldrig for nogen.
    AND (t.status = 'aktiv'
         OR (t.status = 'skjult' AND public.has_role(auth.uid(), 'advisor')));
END;
$$;

COMMENT ON FUNCTION public.get_community_traad(uuid) IS
  'Én community-tråd i samme kolonnesæt som get_community_feed. SECURITY DEFINER med samme fail-closed adgangstjek (kan_laese_community eller advisor; 2/10-2026: gæsten læser med) — tomt resultat for brugere uden læseadgang. Rådgivere ser også SKJULTE tråde (moderation kan fortrydes); ''slettet'' vises aldrig for nogen. Det strukturerede Tiptap-dokument (indhold_json) følger med ved siden af tekstuddraget.';

CREATE OR REPLACE FUNCTION public.get_community_svar(p_traad_id uuid)
RETURNS TABLE(
  id uuid,
  traad_id uuid,
  indhold text,
  indhold_json jsonb,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  forfatter_id uuid,
  forfatter_navn text,
  forfatter_avatar_url text,
  antal_reaktioner bigint,
  jeg_har_reageret boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Samme fail-closed adgangstjek som get_community_feed — SECURITY
  -- DEFINER uden eget tjek er en åben dør uden om policies.
  -- LÆSE-dommen (2/10-2026): kan_laese_community — gæsten læser med.
  IF NOT (public.kan_laese_community(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.traad_id,
    s.indhold,
    s.indhold_json,
    s.status,
    s.created_at,
    s.updated_at,
    s.forfatter_id,
    p.full_name,
    p.avatar_url,
    (SELECT count(*) FROM public.community_reaktioner r WHERE r.svar_id = s.id),
    EXISTS (SELECT 1 FROM public.community_reaktioner r
            WHERE r.svar_id = s.id AND r.bruger_id = auth.uid())
  FROM public.community_svar s
  LEFT JOIN public.profiles p ON p.user_id = s.forfatter_id
  WHERE s.traad_id = p_traad_id
    -- Svarets EGEN status dømmes — uafhængigt af trådens status, så
    -- rådgiveren kan læse svarene i en skjult tråd (tråd-adgangen
    -- afgøres af get_community_traad). Rådgivere ser aktiv OG skjult;
    -- 'slettet' aldrig for nogen.
    AND (s.status = 'aktiv'
         OR (s.status = 'skjult' AND public.has_role(auth.uid(), 'advisor')))
  ORDER BY s.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_community_svar(uuid) IS
  'Aktive svar på en community-tråd, kronologisk (created_at ASC), med forfatter fra profiles og reaktionstal/"har jeg reageret" pr. svar. SECURITY DEFINER med samme fail-closed adgangstjek som get_community_feed (kan_laese_community eller advisor; 2/10-2026: gæsten læser med) — tomt resultat uden læseadgang. Rådgivere ser også SKJULTE svar, uafhængigt af trådens status (moderation kan fortrydes); ''slettet'' vises aldrig for nogen. Det strukturerede Tiptap-dokument (indhold_json) følger med ved siden af tekstuddraget.';

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 4: billed- og filporten — gæsten må se billeder og filer i det, hun læser
-- (kroppene fra 20260812110000 og 20260812140000 tegn for tegn; KUN porten er ændret)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.maa_se_community_billede(_user_id uuid, _sti text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Fail-closed hele vejen: NULL-input eller tom sti er aldrig et ja.
  IF _user_id IS NULL OR _sti IS NULL OR btrim(_sti) = '' THEN
    RETURN false;
  END IF;

  -- 1) Har brugeren adgang til community overhovedet? Samme dom som
  -- læse-RPC'erne (kan_laese_community eller advisor; 2/10-2026: gæsten
  -- læser med) — nej → false.
  IF NOT (public.kan_laese_community(_user_id)
          OR public.has_role(_user_id, 'advisor')) THEN
    RETURN false;
  END IF;

  -- 2) Optræder stien som image-node i et AKTIVT dokument? Kun status =
  -- 'aktiv' tæller: skjules en tråd (eller et svar), skal dens billeder
  -- ikke længere kunne signeres — dommen følger synligheden, ikke
  -- historikken.
  --
  -- Om '$.**': wildcardet matcher på ALLE niveauer og kan ramme samme
  -- node ad flere stier — det var dublet-fælden i tekstudledningen
  -- (20260811200000). Her spørges der kun jsonb_path_exists (findes der
  -- MINDST én match?), så dubletter er harmløse; det er ikke en fejl, at
  -- '**' genbruges her. Uparsbare/skæve dokumenter kaster ikke i lax mode
  -- (default) — noder uden attrs matcher bare ikke; NULL-dokumenter
  -- frasorteres eksplicit.
  --
  -- Formen '$.**?(...)' skrives UDEN mellemrum mellem wildcard og filter:
  -- mellemrummet er ikke gyldigt i alle Postgres-versioners jsonpath-
  -- parser, og formen uden mellemrum er den entydige.
  RETURN EXISTS (
    SELECT 1
    FROM public.community_traade t
    WHERE t.status = 'aktiv'
      AND t.indhold_json IS NOT NULL
      AND jsonb_path_exists(
            t.indhold_json,
            '$.**?(@.type == "image" && @.attrs.path == $sti)',
            jsonb_build_object('sti', _sti)
          )
  ) OR EXISTS (
    SELECT 1
    FROM public.community_svar s
    WHERE s.status = 'aktiv'
      AND s.indhold_json IS NOT NULL
      AND jsonb_path_exists(
            s.indhold_json,
            '$.**?(@.type == "image" && @.attrs.path == $sti)',
            jsonb_build_object('sti', _sti)
          )
  );
END;
$$;

COMMENT ON FUNCTION public.maa_se_community_billede(uuid, text) IS
  'Edge-funktionens PORT før signering af community-billeder — ikke en RLS-policy. Svarer på: må denne bruger se billedet på denne sti? Fail-closed: false ved NULL/tom sti, uden læseadgang til community (kan_laese_community eller advisor; 2/10-2026: gæsten læser med), og når stien ikke optræder som image-node (attrs.path) i indhold_json på en AKTIV tråd eller et AKTIVT svar. Skjules indholdet, følger billedadgangen med.';

CREATE OR REPLACE FUNCTION public.maa_se_community_fil(_user_id uuid, _sti text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Fail-closed hele vejen: NULL-input eller tom sti er aldrig et ja.
  IF _user_id IS NULL OR _sti IS NULL OR btrim(_sti) = '' THEN
    RETURN false;
  END IF;

  -- 1) Har brugeren adgang til community overhovedet? Samme dom som
  -- læse-RPC'erne (kan_laese_community eller advisor; 2/10-2026: gæsten
  -- læser med) — nej → false.
  IF NOT (public.kan_laese_community(_user_id)
          OR public.has_role(_user_id, 'advisor')) THEN
    RETURN false;
  END IF;

  -- 2) Optræder stien som fil-node i et AKTIVT dokument? Kun status =
  -- 'aktiv' tæller: skjules en tråd (eller et svar), skal dens filer
  -- ikke længere kunne signeres — dommen følger synligheden, ikke
  -- historikken.
  --
  -- Om '$.**': wildcardet matcher på ALLE niveauer og kan ramme samme
  -- node ad flere stier — det var dublet-fælden i tekstudledningen
  -- (20260811200000). Her spørges der kun jsonb_path_exists (findes der
  -- MINDST én match?), så dubletter er harmløse. Uparsbare/skæve
  -- dokumenter kaster ikke i lax mode (default) — noder uden attrs
  -- matcher bare ikke; NULL-dokumenter frasorteres eksplicit.
  --
  -- Formen '$.**?(...)' skrives UDEN mellemrum mellem wildcard og filter:
  -- det er den entydige form (mellemrummet parser ikke i alle Postgres-
  -- versioners jsonpath-parser, jf. 20260812110000).
  RETURN EXISTS (
    SELECT 1
    FROM public.community_traade t
    WHERE t.status = 'aktiv'
      AND t.indhold_json IS NOT NULL
      AND jsonb_path_exists(
            t.indhold_json,
            '$.**?(@.type == "fil" && @.attrs.path == $sti)',
            jsonb_build_object('sti', _sti)
          )
  ) OR EXISTS (
    SELECT 1
    FROM public.community_svar s
    WHERE s.status = 'aktiv'
      AND s.indhold_json IS NOT NULL
      AND jsonb_path_exists(
            s.indhold_json,
            '$.**?(@.type == "fil" && @.attrs.path == $sti)',
            jsonb_build_object('sti', _sti)
          )
  );
END;
$$;

COMMENT ON FUNCTION public.maa_se_community_fil(uuid, text) IS
  'Edge-funktionens PORT før signering af community-filer — ikke en RLS-policy. Svarer på: må denne bruger hente filen på denne sti? Fail-closed: false ved NULL/tom sti, uden læseadgang til community (kan_laese_community eller advisor; 2/10-2026: gæsten læser med), og når stien ikke optræder som fil-node (type = ''fil'', attrs.path) i indhold_json på en AKTIV tråd eller et AKTIVT svar. Skjules indholdet, følger filadgangen med.';

-- Grants på de fem RPC'er: UÆNDREDE (CREATE OR REPLACE bevarer dem). Ingen REVOKE/GRANT her.

SELECT polname, pg_get_expr(polqual, polrelid) AS using_udtryk
  FROM pg_policy
 WHERE polrelid IN ('public.community_traade'::regclass, 'public.community_svar'::regclass) AND polcmd = 'r'
 ORDER BY 1;
