-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- OMDØBT 2/10-2026 ~05:15 (før kørsel): tidsstemplet flyttet efter 20261002100000_maal_bekraeft_kvartal.sql, som ER kørt — en ukørt migration må aldrig sortere før en kørt (metaSend.guard dom 11; forsiden nede 12 timer 19/9). Indholdet er uændret.
--
-- Migration: kald_edge sender OGSÅ `apikey: <sb_secret>` — fase 3a, trin 1
-- (docs/prod-hjem-plan.md, «Fase 3a, trin 1–3»). Grønt lys til at BYGGE:
-- Jonas 1/10-2026 08:06 («Ja 3a»). kald_edge er SECURITY DEFINER og står
-- derfor på FORBIDDEN-listen (CLAUDE.md) — at KØRE denne fil kræver Jonas'
-- eget ja i det øjeblik, ikke kun byggetilladelsen.
--
-- HVORFOR: Supabase sletter legacy-nøglerne «Late 2026, TBC»
-- (https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys).
-- Målt i prod 1/10 (kun SELECT): alle 24 HTTP-cron-jobs går gennem
-- public.kald_edge, som sender vault-posten 'email_queue_service_role_key'
-- (en legacy service_role-JWT, 219 tegn) som `Authorization: Bearer …`.
-- Ingen anden funktion kalder net.http_post. Runtimens
-- SUPABASE_SERVICE_ROLE_KEY er en sb_secret-nøgle (41 tegn).
-- Med de nye nøgler fejler verify_jwt («the keys aren't JWTs»); Supabase
-- anviser verify_jwt = false, autorisation i koden og `sb_secret_…` i
-- `apikey`-headeren.
--
-- HVAD DENNE FIL GØR — og kun det:
--   * kald_edge sender den eksisterende `Authorization: Bearer <legacy>`
--     UÆNDRET, og DERUDOVER `apikey: <sb_secret>` fra en NY vault-post,
--     'kald_edge_sb_secret' — når den findes og har formen sb_secret_….
--   * MANGLER den nye post (eller er den tom), sendes PRÆCIS som i dag
--     (kun Bearer). Har den en anden form, sendes den IKKE, og der rejses en
--     WARNING (aldrig en fejl). Opslaget i vault står i sin egen
--     EXCEPTION-blok: intet ved den nye post kan få kald_edge til at fejle.
--     Derfor kan filen køres, FØR Jonas har lagt nøglen i vault — den nye
--     post er kontakten, og at slette den er tilbagerulningen.
--   * ALT andet er ordret som i 20260910180000_kald_edge.sql: navnevalideringen
--     (^[a-z0-9-]+$), timeout-grænserne (interval og loft), RAISE når
--     legacy-nøglen mangler, URL-roden, signaturen, SECURITY DEFINER og
--     search_path. CREATE OR REPLACE bevarer ejer og rettigheder (proacl),
--     så der er INGEN GRANT/REVOKE her — FØR/EFTER-målingen nedenfor beviser det.
--
-- HVAD DEN IKKE GØR: rører ingen cron-jobs, ingen verify_jwt, ingen
-- edge function. Modtagersiden (authenticateServiceRole i
-- supabase/functions/_shared/edgeFunctionAuth.ts, dommen i
-- _shared/serviceNoegle.ts) godtager nøglen, NÅR den udrullede bundle har
-- den nye kode — merge udruller ikke (CLAUDE.md «Deployment af edge
-- functions»). Indtil da ignoreres apikey-headeren af modtagerne, og
-- role-claimet bærer som i dag.
--
-- ÉN UMÅLT RISIKO (læs før vault-posten lægges ind): om gatewayen
-- (verify_jwt = true) godtager et kald, der bærer BÅDE en gyldig legacy-
-- Bearer OG en sb_secret i `apikey`, er IKKE målt. Derfor er rækkefølgen:
-- migration (ingen virkning uden posten) → vault-posten → STRAKS én
-- tørkørsel (trin E2 nedenfor) → 200 = fortsæt; alt andet = slet posten
-- (trin R1), og kald_edge sender som før — uden en ny SQL-ændring.
--
-- ── FØR (kør i Lovable → SQL editor; ét resultatsæt) ─────────────────────
-- Gem HELE outputtet (definitionen er tilbagerulningen). Forventet:
-- ejer postgres (eller den ejer, der står — skriv den ned), prosecdef = true,
-- proacl uden anon/authenticated/PUBLIC, og definitionen = afsnit 2 i
-- 20260910180000_kald_edge.sql. AFVIGER definitionen fra repoets: STOP —
-- prod er så en anden end repoet, og denne fil må ikke køres, før forskellen
-- er forstået.
--
--   SELECT 'funktion' AS sektion,
--          p.proowner::regrole::text AS a,
--          p.prosecdef::text AS b,
--          coalesce(p.proacl::text, '(standard)') AS c,
--          pg_get_functiondef(p.oid) AS d
--   FROM pg_proc p
--   WHERE p.oid = 'public.kald_edge(text,jsonb,integer,integer)'::regprocedure
--   UNION ALL
--   SELECT 'vault-navn', s.name, NULL, NULL, NULL
--   FROM vault.secrets s
--   WHERE s.name IN ('email_queue_service_role_key', 'kald_edge_sb_secret');
--   -- Forventet: én funktionsrække + vault-navnet 'email_queue_service_role_key'
--   -- (og IKKE 'kald_edge_sb_secret' — den lægges ind efter E1). Kun NAVNE
--   -- læses fra vault, aldrig værdier.
--
-- ── EFTER ────────────────────────────────────────────────────────────────
-- E1) Definition og rettigheder (ét resultatsæt):
--   SELECT p.proowner::regrole::text AS ejer,
--          p.prosecdef AS security_definer,
--          coalesce(p.proacl::text, '(standard)') AS acl,
--          pg_get_functiondef(p.oid) LIKE '%''apikey''%' AS sender_apikey,
--          pg_get_functiondef(p.oid) LIKE '%''Bearer '' || v_bearer%' AS sender_bearer,
--          pg_get_functiondef(p.oid) LIKE '%kald_edge_sb_secret%' AS ny_vaultpost
--   FROM pg_proc p
--   WHERE p.oid = 'public.kald_edge(text,jsonb,integer,integer)'::regprocedure;
--   -- Forventet: ejer og acl = FØR, alle tre sandhedsværdier true.
--
-- E2) Tørkørsel — UDEN den nye vault-post er kaldet tegn for tegn som i dag:
--   SELECT public.kald_edge('indgangs-paamindelser-cron') AS request_id;
--   -- vent 5–10 s, derefter:
--   SELECT id, status_code, timed_out, error_msg, created, left(content, 200) AS content
--   FROM net._http_response ORDER BY id DESC LIMIT 1;
--   -- Forventet: 200, timed_out false, "dry_run": true i content.
--
-- ── DEREFTER (Jonas, ikke Claude — Claude læser aldrig vault) ─────────────
-- V1) Læg runtimens sb_secret-nøgle i vault under det NYE navn:
--   SELECT vault.create_secret('<sb_secret_…>', 'kald_edge_sb_secret',
--     'Fase 3a: sendes af kald_edge som apikey-header. Skal være = runtimens SUPABASE_SERVICE_ROLE_KEY (sb_secret_…).');
--   ÅBENT: hvor værdien kan aflæses i Lovable Cloud, er IKKE målt
--   (docs/prod-hjem-plan.md, «Fase 3a, trin 1–3», usikkerhed U1).
-- V2) Gentag E2 STRAKS. 200 = gatewayen tåler begge headere; fortsæt.
--     Alt andet end 200 (særligt 401 «Invalid JWT»/«Invalid API key»):
--     kør R1 med det samme — næste cron-kørsel rammer ellers det samme.
-- V3) At headeren faktisk står på kaldet (uden at vise værdien) — kør
--     LIGE efter et kald, før pg_nets worker har taget rækken:
--   SELECT id, headers ? 'apikey' AS har_apikey,
--          (headers->>'Authorization') LIKE 'Bearer %' AS har_bearer
--   FROM net.http_request_queue ORDER BY id DESC LIMIT 1;
--   -- Tom = workeren nåede først (ikke et fund). At modtageren GODTAGER
--   -- nøglen, kan først bevises af trin 2's første function (svarer 200 med
--   -- verify_jwt = false og «kun nøgle») — se planen.
--
-- ── TILBAGERULNING ───────────────────────────────────────────────────────
-- R1) Uden SQL-ændring af funktionen: fjern den nye post — kald_edge sender
--     straks som før (kun Bearer):
--   DELETE FROM vault.secrets WHERE name = 'kald_edge_sb_secret';
-- R2) Hele funktionen: kør FØR-outputtets definition (kolonne d) igen, eller
--     afsnit 2 «CREATE OR REPLACE FUNCTION public.kald_edge(…)» fra
--     20260910180000_kald_edge.sql. Ejer og rettigheder står uændret.

CREATE OR REPLACE FUNCTION public.kald_edge(
  funktion text,
  body jsonb DEFAULT '{}'::jsonb,
  timeout_ms integer DEFAULT NULL,
  interval_ms integer DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- URL-roden og nøglenavnet — de to ting der 9/9 stod ni steder.
  v_rod constant text := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/';
  v_noegle constant text := 'email_queue_service_role_key';
  -- Fase 3a, trin 1: den nye nøgle (sb_secret_…), sendt som apikey.
  v_noegle_ny constant text := 'kald_edge_sb_secret';
  v_timeout integer;
  v_bearer text;
  v_apikey text;
  v_headers jsonb;
BEGIN
  IF funktion IS NULL OR funktion !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'kald_edge: ugyldigt funktionsnavn %', funktion;
  END IF;

  v_timeout := COALESCE(timeout_ms, public.kald_edge_standard_ms());

  -- GRÆNSEN (plan-timeouten §6): en timeout må aldrig være længere end
  -- jobbets eget interval — ellers kan to kørsler af samme job overlappe og
  -- behandle de samme rækker. Kalderen oplyser sit interval; uden det gælder
  -- kun loftet.
  IF interval_ms IS NOT NULL AND v_timeout >= interval_ms THEN
    RAISE EXCEPTION 'kald_edge: timeout % ms er ikke kortere end jobbets interval % ms (%)', v_timeout, interval_ms, funktion;
  END IF;
  IF v_timeout <= 0 OR v_timeout > public.kald_edge_loft_ms() THEN
    RAISE EXCEPTION 'kald_edge: timeout % ms er uden for 1..% ms (%)', v_timeout, public.kald_edge_loft_ms(), funktion;
  END IF;

  -- Nøglen — og en HØJ fejl når den mangler, ikke «Bearer » og 401 (9/9).
  SELECT s.decrypted_secret INTO v_bearer
  FROM vault.decrypted_secrets s
  WHERE s.name = v_noegle
  LIMIT 1;
  IF v_bearer IS NULL OR v_bearer = '' THEN
    RAISE EXCEPTION 'kald_edge: % mangler i vault', v_noegle;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_bearer
  );

  -- Fase 3a, trin 1: den nye nøgle, HVIS den findes — ALDRIG en fejl.
  -- Mangler posten, sendes som før (kun Bearer). Forkert form → sendes ikke,
  -- kun en WARNING (værdien står aldrig i teksten). Opslaget har sin egen
  -- EXCEPTION-blok, så intet ved den nye post kan vælte et cron-kald.
  BEGIN
    SELECT btrim(s.decrypted_secret, E' \t\r\n') INTO v_apikey
    FROM vault.decrypted_secrets s
    WHERE s.name = v_noegle_ny
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_apikey := NULL;
    RAISE WARNING 'kald_edge: % kunne ikke læses (%) — sender kun Bearer', v_noegle_ny, SQLSTATE;
  END;

  IF v_apikey IS NOT NULL AND v_apikey ~ '^sb_secret_[A-Za-z0-9_-]+$' THEN
    v_headers := v_headers || jsonb_build_object('apikey', v_apikey);
  ELSIF v_apikey IS NOT NULL AND v_apikey <> '' THEN
    RAISE WARNING 'kald_edge: % har ikke formen sb_secret_… — sendes ikke (%)', v_noegle_ny, funktion;
  END IF;

  RETURN net.http_post(
    url := v_rod || funktion,
    headers := v_headers,
    body := COALESCE(body, '{}'::jsonb),
    timeout_milliseconds := v_timeout
  );
END;
$$;

COMMENT ON FUNCTION public.kald_edge(text, jsonb, integer, integer) IS
  'Ét sted for cron-jobbenes edge-kald (10/9): URL-rod, vault-nøgle og timeout. Standard 30 s (kald_edge_standard_ms), loft 150 s (kald_edge_loft_ms). Afviser en timeout der ikke er kortere end det oplyste interval_ms — to kørsler af samme job må aldrig overlappe. Kaster hvis legacy-nøglen (email_queue_service_role_key) mangler i vault. Fase 3a, trin 1 (20261002290000): sender OGSÅ apikey fra vault-posten kald_edge_sb_secret, når den findes og har formen sb_secret_… — ellers som før; aldrig en fejl. Jobbene genplanlægges ét ad gangen: SELECT public.kald_edge(''<funktion>'', ''<body>''::jsonb, <timeout_ms|NULL>, <interval_ms>);';
