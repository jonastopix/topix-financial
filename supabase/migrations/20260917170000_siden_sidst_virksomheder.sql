-- «Siden sidst» med links på navnene (17/9-2026, rådgivernes forside PR 3;
-- analyse-raadgivernes-forside.md §3.1 pkt. 2 / §6 forslag 3: «Siden sidst»
-- nævner navne uden link — «den ene ting på siden der ligner et link uden
-- at være det»).
--
-- HVAD: en NY funktion, get_siden_sidst_virksomheder(siden), ved SIDEN AF
-- den gamle get_siden_sidst(siden) (20260909100000). Samme krop, samme
-- univers, samme seks hændelseskilder, samme «højst seks pr. slags, nyeste
-- først» — men navnene kommer som `virksomheder jsonb`
-- ([{"id": <company_id>, "name": <navn>}, …]) i stedet for `navne text[]`,
-- så fladen kan gøre hvert navn til et link (/virksomhed/{id}).
--
-- HVORFOR EN NY FUNKTION OG IKKE CREATE OR REPLACE PÅ DEN GAMLE: Postgres
-- tillader ikke at ændre returtypen med CREATE OR REPLACE («cannot change
-- return type of existing function»); det ville kræve DROP + CREATE og
-- dermed et hul, hvor en udrullet frontend rammer ingenting. En ny
-- funktion er bagudkompatibel begge veje:
--   - migration FØR Update: den gamle frontend kalder get_siden_sidst som
--     før; intet ændrer sig, før Update-klikket.
--   - Update FØR migration: den nye frontend kalder den nye RPC, får
--     PostgREST PGRST202 («Could not find the function»), og
--     hooks/sidenSidst.ts falder tilbage til get_siden_sidst — navnene står
--     som tekst uden links, ingen fejl på skærmen. Anbefalet rækkefølge:
--     migration først, så Update (så er linkene der fra første visning).
--
-- SECURITY DEFINER — SAGT HØJT: funktionen er SECURITY DEFINER (som den
-- gamle, som get_users_last_login og get_cron_vagt), fordi messages/
-- company_actions/company_traek læses på tværs af virksomheder i én
-- forespørgsel. Sikkerheden er UÆNDRET: samme `SET search_path = public`,
-- samme has_role(auth.uid(), 'advisor'::app_role) i WHERE (nul rækker for
-- alle andre), samme GRANT EXECUTE TO authenticated. Det eneste nye der
-- forlader funktionen er companies.id — som rådgivere allerede kan læse
-- direkte (SELECT-policy på companies). Ingen beskedtekst, ingen beløb,
-- ingen medlems-id'er. CLAUDE.md: SECURITY DEFINER-funktioner kræver
-- Jonas' eksplicitte grønne lys — GIVET: JONAS 17/9-2026 (ordret): «Vi går
-- med din anbefaling».
--
-- IKKE KØRT i prod. Køres MANUELT i Lovable → SQL editor (jf. CLAUDE.md),
-- FØR Update-klikket (efter Update uden migrationen falder forsiden selv
-- tilbage til get_siden_sidst).
--
-- ROLLBACK: DROP FUNCTION public.get_siden_sidst_virksomheder(timestamptz);
-- — den gamle funktion er urørt, og hooken falder selv tilbage til den
-- (PGRST202). Ingen tabeller, policies eller triggere røres.
--
-- FØR/EFTER — ÉT resultatsæt (kør FØR migrationen, gem CSV'en; kør igen
-- EFTER; kun linjerne «ny …» må ændre sig, og «gammel md5» SKAL være ens):
--
--   select 'gammel md5' as noegle,
--          md5(pg_get_functiondef('public.get_siden_sidst(timestamptz)'::regprocedure)) as vaerdi
--   union all select 'gammel returform', pg_get_function_result('public.get_siden_sidst(timestamptz)'::regprocedure)
--   union all select 'gammel secdef | search_path',
--          (p.prosecdef::text || ' | ' || coalesce(array_to_string(p.proconfig, ','), ''))
--          from pg_proc p where p.oid = 'public.get_siden_sidst(timestamptz)'::regprocedure
--   union all select 'ny findes', (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'get_siden_sidst_virksomheder'))::text
--   union all select 'ny returform', coalesce((select pg_get_function_result(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'get_siden_sidst_virksomheder'), '—')
--   union all select 'ny secdef | search_path', coalesce((select p.prosecdef::text || ' | ' || coalesce(array_to_string(p.proconfig, ','), '')
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'get_siden_sidst_virksomheder'), '—')
--   union all select 'ny md5', coalesce((select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'get_siden_sidst_virksomheder'), '—')
--   union all select 'ny grants (authenticated)', coalesce((select string_agg(grantee || ':' || privilege_type, ',')
--          from information_schema.routine_privileges
--          where specific_schema = 'public' and routine_name = 'get_siden_sidst_virksomheder'), '—')
--   union all select 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI');
--
-- FORVENTET FØR: gammel md5 = <a>, gammel returform «TABLE(slags text, antal
-- integer, navne text[])», «ny findes» = false, de øvrige «ny …» = «—».
-- FORVENTET EFTER: gammel md5 = <a> (UÆNDRET), «ny findes» = true, ny
-- returform «TABLE(slags text, antal integer, virksomheder jsonb)», ny
-- secdef «true | search_path=public», grants indeholder
-- «authenticated:EXECUTE».
--
-- KALDET, der viser FORMEN (SQL editoren har intet auth.uid() → has_role
-- er falsk → NUL rækker, men kolonnerne vises; rækker ses kun på forsiden
-- som rådgiver):
--   select * from public.get_siden_sidst_virksomheder(now() - interval '7 days');
-- — FØR: «function … does not exist». EFTER: 0 rækker med kolonnerne
-- slags | antal | virksomheder.

CREATE OR REPLACE FUNCTION public.get_siden_sidst_virksomheder(siden timestamptz)
RETURNS TABLE (slags text, antal integer, virksomheder jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH univers AS (
    SELECT c.id, c.name
    FROM companies c
    WHERE COALESCE(c.is_legat, false) = false
      AND COALESCE(c.er_kunde, true) = true
  ),
  haendelser AS (
    -- rapporter: committede MÅLTE tal (et estimat er ikke en rapport der kom ind)
    SELECT 'rapporter'::text AS slags, f.company_id, f.committed_at AS tid
    FROM financial_report_facts f
    WHERE f.committed_at > siden AND f.data_basis = 'measured'
    UNION ALL
    -- beskeder: menneskelige beskeder fra nogen der IKKE er rådgiver/admin
    SELECT 'beskeder', c.company_id, m.created_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.created_at > siden
      AND m.message_type = 'user'
      AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = m.sender_id AND r.role IN ('advisor','admin'))
    UNION ALL
    -- svar: accepteret, eller lukket med et svar (opgaveEngine.accepter/luk)
    SELECT 'svar', a.company_id, COALESCE(a.closed_at, a.accepted_at)
    FROM company_actions a
    WHERE (a.accepted_at > siden)
       OR (a.closed_at > siden AND a.status IN ('done','not_done','dropped'))
    UNION ALL
    -- betalinger: et betalt træk, eller en periode oprettet af en betaling (indgang/fornyelse)
    SELECT 'betalinger', t.company_id, t.betalt_at
    FROM company_traek t
    WHERE t.betalt_at > siden AND t.status = 'betalt'
    UNION ALL
    SELECT 'betalinger', p.company_id, p.created_at
    FROM company_perioder p
    WHERE p.created_at > siden AND p.stripe_reference IS NOT NULL
    UNION ALL
    -- medlemmer: nye rækker i company_members
    SELECT 'medlemmer', cm.company_id, cm.created_at
    FROM company_members cm
    WHERE cm.created_at > siden
  ),
  i_univers AS (
    SELECT h.slags, h.company_id, u.name, h.tid
    FROM haendelser h JOIN univers u ON u.id = h.company_id
  ),
  pr_virksomhed AS (
    SELECT slags, company_id, name, max(tid) AS nyeste, count(*) AS antal
    FROM i_univers GROUP BY slags, company_id, name
  )
  SELECT p.slags,
         sum(p.antal)::integer AS antal,
         -- Højst seks virksomheder pr. slags, nyeste først — som navne text[]
         -- i get_siden_sidst, nu med id'et ved siden af navnet.
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('id', q.company_id, 'name', q.name) ORDER BY q.nyeste DESC)
           FROM (
             SELECT q2.company_id, q2.name, q2.nyeste
             FROM pr_virksomhed q2
             WHERE q2.slags = p.slags
             ORDER BY q2.nyeste DESC
             LIMIT 6
           ) q
         ), '[]'::jsonb) AS virksomheder
  FROM pr_virksomhed p
  WHERE has_role(auth.uid(), 'advisor'::app_role)
  GROUP BY p.slags;
$$;

GRANT EXECUTE ON FUNCTION public.get_siden_sidst_virksomheder(timestamptz) TO authenticated;

COMMENT ON FUNCTION public.get_siden_sidst_virksomheder(timestamptz) IS
  'Advisor-only by design (has_role i WHERE — nul rækker for andre). Som get_siden_sidst, men virksomhederne som jsonb [{id, name}] (højst seks pr. slags, nyeste først), så forsiden kan linke hvert navn til /virksomhed/{id} (src/lib/sidenSidst.ts, hooks/sidenSidst.ts). Den gamle funktion består; hooken falder tilbage til den når denne ikke findes (PGRST202).';
