-- KØRT i prod 2/10-2026 kl. 18:05 (Claude via Lovables query_database; Jonas' grønne lys i aftenlisten a1002-mest-laest «Begge, med migrationen»). FØR: funktionen fandtes ikke. EFTER: prosecdef true · s · search_path=public, pg_temp · ejer postgres · anon false · authenticated true · service_role true · 0 som postgres · ugestart 2026-09-27 22:00Z. RLS-prøve (rullet tilbage): medlem 6 rækker, 0 andres visninger direkte; uden adgang 0.
--
-- Community: mærket «Mest læst denne uge» på højst én tråd i feedet (den
-- godkendte mockup til Community-feedet, 2/10-2026).
--
-- HVAD:
--   Én ny funktion, public.community_mest_laest_uge()
--   RETURNS TABLE(traad_id uuid, laesere bigint) — for hver AKTIV tråd antal
--   FORSKELLIGE læsere i den aktuelle ISO-uge (dansk tid), trådens forfatter
--   og tjenestekonti (public.tjenestekonti) fraregnet. Kun tråde med ≥ 1
--   læser; højst 20 rækker, flest først. Ingen tabel, ingen kolonne, ingen
--   policy ændres. Intet andet end aggregater forlader funktionen — aldrig et
--   bruger-id.
--
-- HVORFOR SECURITY DEFINER:
--   community_visninger har kun self-only SELECT for medlemmer (RLS,
--   20260811160000) — et medlem kan ikke tælle andres visninger. Tallet pr.
--   tråd (et antal, ingen identitet) er af samme art som antal_visninger, som
--   feedet allerede viser alle med læseadgang. Funktionen er derfor
--   SECURITY DEFINER med søgestien låst (public, pg_temp) og PORTEN FØRST:
--   kan_laese_community(auth.uid()) ELLER has_role(auth.uid(), 'advisor')
--   — samme læsedom som get_community_feed (20261002242000) plus rådgiverne.
--   Uden adgang: tomt svar, ingen fejl (get_community_feed-formen). I SQL
--   editoren og for service_role er auth.uid() NULL → porten falsk → tomt.
--
-- HVAD «LÆSER I UGEN» BETYDER (målt i kilden 2/10, IKKE i prod):
--   community_visninger har ÉN række pr. (traad_id, bruger_id) — primærnøglen —
--   og registrer_community_visning skriver INSERT … ON CONFLICT DO NOTHING
--   (20260811180000; kroppen i 20261002242000 rører ikke den linje). set_at er
--   altså FØRSTE visning. «Læsere i ugen» = personer, der læste tråden FØRSTE
--   gang i ugen; en genlæsning i ugen af en, der så tråden før mandag, tæller
--   ikke. Det er bevidst ikke ændret her (det ville kræve en ændring af
--   registrer_community_visning, en SECURITY DEFINER på FORBIDDEN-listen, og
--   af antal_visninger-cachens trigger).
--
-- UGEGRÆNSEN (ISO-uge, mandag 00:00 Europe/Copenhagen), regnestykket:
--   ugestart := date_trunc('week', now() AT TIME ZONE 'Europe/Copenhagen')
--               AT TIME ZONE 'Europe/Copenhagen'
--   1) now() AT TIME ZONE 'Europe/Copenhagen' → dansk vægur (timestamp UDEN zone).
--   2) date_trunc('week', …) → mandag 00:00 i samme ISO-uge (Postgres' 'week'
--      er ISO: ugen starter mandag).
--   3) … AT TIME ZONE 'Europe/Copenhagen' → tilbage til timestamptz (det
--      øjeblik, hvor det var mandag 00:00 i København).
--   Eksempel, sommertid: now() = 2026-10-02 14:00Z (fredag 16:00 CEST)
--     → 2026-10-02 16:00 → mandag 2026-09-28 00:00 → 2026-09-27 22:00Z.
--   Eksempel, vintertid: now() = 2026-11-01 23:30Z (mandag 00:30 CET)
--     → 2026-11-02 00:30 → mandag 2026-11-02 00:00 → 2026-11-01 23:00Z.
--     (I UTC er det stadig søndag — derfor regnes ugen IKKE i UTC.)
--   Tælles: set_at >= ugestart. En øvre grænse er unødvendig: set_at sættes af
--   serveren (default now()) og ligger aldrig efter now().
--
-- KLIENTEN: src/lib/hjemmebane/communityApi.ts:hentMestLaestUge (fail-soft:
-- 42883/PGRST202 = funktionen findes ikke endnu → [] → intet mærke) og den
-- rene dom src/lib/hjemmebane/communityMestLaest.ts:vaelgMestLaest (vinder,
-- tærskel 3, uafgjort = intet mærke). Kildeværn:
-- src/lib/__tests__/communityMestLaest.guard.test.ts.
--
-- ─────────────────────────────────────────────────────────────────────────
-- FØR-SQL (Lovable SQL editor — ét resultatsæt):
--
--   SELECT 'funktionen findes' AS sektion,
--          (to_regprocedure('public.community_mest_laest_uge()') IS NOT NULL)::text AS vaerdi
--   UNION ALL
--   SELECT 'kan_laese_community findes',
--          (to_regprocedure('public.kan_laese_community(uuid)') IS NOT NULL)::text
--   UNION ALL
--   SELECT 'tjenestekonti findes',
--          (to_regclass('public.tjenestekonti') IS NOT NULL)::text
--   UNION ALL
--   SELECT 'community_visninger kolonner',
--          string_agg(column_name || ':' || data_type, ', ' ORDER BY ordinal_position)
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'community_visninger'
--   UNION ALL
--   SELECT 'community_traade status-værdier',
--          string_agg(DISTINCT status, ', ')
--     FROM public.community_traade;
--
--   Forventet: false · true · true · «traad_id:uuid, bruger_id:uuid,
--   set_at:timestamp with time zone» · bl.a. «aktiv». Står der andet: STOP.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EFTER-SQL (ét resultatsæt):
--
--   SELECT 'prosecdef' AS sektion, p.prosecdef::text AS vaerdi
--     FROM pg_proc p WHERE p.oid = 'public.community_mest_laest_uge()'::regprocedure
--   UNION ALL
--   SELECT 'provolatile (s = STABLE)', p.provolatile::text
--     FROM pg_proc p WHERE p.oid = 'public.community_mest_laest_uge()'::regprocedure
--   UNION ALL
--   SELECT 'proconfig', array_to_string(p.proconfig, ' ; ')
--     FROM pg_proc p WHERE p.oid = 'public.community_mest_laest_uge()'::regprocedure
--   UNION ALL
--   SELECT 'ejer', pg_get_userbyid(p.proowner)::text
--     FROM pg_proc p WHERE p.oid = 'public.community_mest_laest_uge()'::regprocedure
--   UNION ALL
--   SELECT 'execute ' || r, has_function_privilege(r, 'public.community_mest_laest_uge()', 'EXECUTE')::text
--     FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r
--   UNION ALL
--   SELECT 'execute PUBLIC (acl)', coalesce(array_to_string(p.proacl, ' ; '), 'null')
--     FROM pg_proc p WHERE p.oid = 'public.community_mest_laest_uge()'::regprocedure
--   UNION ALL
--   SELECT 'kald som postgres (auth.uid() null → 0 rækker)',
--          (SELECT count(*) FROM public.community_mest_laest_uge())::text
--   UNION ALL
--   SELECT 'ugestart (UTC)',
--          (date_trunc('week', now() AT TIME ZONE 'Europe/Copenhagen')
--             AT TIME ZONE 'Europe/Copenhagen')::text;
--
--   Forventet: true · s · «search_path=public, pg_temp» · postgres ·
--   anon false · authenticated true · service_role true · acl uden «=X/»
--   (PUBLIC) og uden «anon=» · 0 · seneste mandag 00:00 dansk i UTC.
--
-- ─────────────────────────────────────────────────────────────────────────
-- RLS-PRØVE (skitse — i én transaktion, rulles tilbage; <medlem-uuid> og
-- <gaest-uden-adgang-uuid> sættes ind):
--
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<medlem-uuid>","role":"authenticated"}', true);
--   SELECT 'medlem' AS hvem, * FROM public.community_mest_laest_uge();
--     -- forventet: rækker for aktive tråde (hvis nogen er læst i ugen); aldrig et bruger-id.
--   SELECT 'medlem, direkte' AS hvem, count(*) FROM public.community_visninger;
--     -- forventet: KUN medlemmets egne rækker (RLS uændret).
--   SELECT set_config('request.jwt.claims', '{"sub":"<uden-adgang-uuid>","role":"authenticated"}', true);
--   SELECT 'uden adgang' AS hvem, count(*) FROM public.community_mest_laest_uge();
--     -- forventet: 0.
--   ROLLBACK;
--
--   Og som anon (forventet: permission denied for function):
--   BEGIN; SET LOCAL ROLE anon; SELECT * FROM public.community_mest_laest_uge(); ROLLBACK;
--
-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (intet andet afhænger af funktionen; klienten er fail-soft på 42883):
--
--   DROP FUNCTION IF EXISTS public.community_mest_laest_uge();
--
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_mest_laest_uge()
RETURNS TABLE(traad_id uuid, laesere bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _ugestart timestamptz;
BEGIN
  -- PORTEN FØRST: samme læsedom som feedet (kan_laese_community) eller rådgiver.
  IF auth.uid() IS NULL
     OR NOT (public.kan_laese_community(auth.uid()) OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  -- Mandag 00:00 Europe/Copenhagen i den aktuelle ISO-uge (regnestykket i filhovedet).
  _ugestart := date_trunc('week', now() AT TIME ZONE 'Europe/Copenhagen')
                 AT TIME ZONE 'Europe/Copenhagen';

  RETURN QUERY
  SELECT v.traad_id, count(DISTINCT v.bruger_id)::bigint AS laesere
    FROM public.community_visninger v
    JOIN public.community_traade t ON t.id = v.traad_id
   WHERE t.status = 'aktiv'
     AND v.set_at >= _ugestart
     AND v.bruger_id <> t.forfatter_id
     AND NOT EXISTS (SELECT 1 FROM public.tjenestekonti tk WHERE tk.user_id = v.bruger_id)
   GROUP BY v.traad_id
   -- Positionsnumre, ikke navne: traad_id/laesere er også OUT-parametre, og
   -- plpgsql ville kalde et ukvalificeret navn tvetydigt (variable_conflict).
   ORDER BY 2 DESC, 1
   LIMIT 20;
END;
$$;

COMMENT ON FUNCTION public.community_mest_laest_uge() IS
  'Community «Mest læst denne uge» (2/10-2026): pr. AKTIV tråd antal forskellige læsere med første visning (community_visninger.set_at) siden mandag 00:00 Europe/Copenhagen, trådens forfatter og tjenestekonti fraregnet; højst 20, flest først. SECURITY DEFINER fordi community_visninger er self-only for medlemmer; port FØRST: kan_laese_community(auth.uid()) OR has_role(auth.uid(),''advisor''), ellers tomt. Kun aggregater, aldrig bruger-id. Klient: communityApi.hentMestLaestUge + communityMestLaest.vaelgMestLaest (tærskel 3, uafgjort = intet mærke).';

REVOKE ALL ON FUNCTION public.community_mest_laest_uge() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_mest_laest_uge() FROM anon;
GRANT EXECUTE ON FUNCTION public.community_mest_laest_uge() TO authenticated;
-- service_role arver IKKE authenticated-grants (lærdom 10/8, get_member_directory).
GRANT EXECUTE ON FUNCTION public.community_mest_laest_uge() TO service_role;
