-- Migration: kald_edge — ét sted for URL, nøgle og timeout på cron-jobbenes
-- edge-kald. OPRETTER KUN FUNKTIONEN. Ingen jobs genplanlægges her (punkt 2
-- i ~/Downloads/plan-timeouten.md): de tages ét ad gangen bagefter, hvert
-- skridt dikteret for sig med bevis imellem — husets mønster fra de otte
-- sletninger 8/9.
--
-- HVORFOR (recon-pg-net-timeout.md, 10/9): pg_nets standard-timeout er
-- 5.000 ms (sql/pg_net.sql: timeout_milliseconds int DEFAULT 5000), og ingen
-- af vores ni HTTP-jobs sætter den. Det er en KLIENT-timeout: pg_net lukker
-- forbindelsen efter fem sekunder, og edge-funktionen AFBRYDES (DEL 4, målt
-- 3/9). Målt 10/9 08:45–09:40: hvert andet kald til process-notification-
-- emails timede ud — kørslen blev KLIPPET, ikke tabt (motoren stempler pr.
-- række), men dagsdomme som daily-report-reminder har ingen kø at falde
-- tilbage på. URL-roden, nøglenavnet og det manglende tal stod ni steder;
-- 9/9 var det netop nøglens NAVN der skulle findes i ni kommandoer.
--
-- TALLET — AFGJORT af Jonas 10/9: 30 SEKUNDER som standard. Ikke en måling
-- (funktionens egen varighed kan ikke læses i databasen; cron.job_run_details
-- måler kun net.http_posts returtid, median 0,1 s), men to kendte tal: huset
-- satte timeout_milliseconds := 150000 på ét kald 3/9 da samme fejl blev
-- fundet, og det korteste interval i huset er fem minutter. Tredive sekunder
-- er langt nok til en kold start og langt fra at kunne overlappe.
--
-- generate-weekly-focus FÅR LÆNGERE: 150 sekunder. Den kører én gang om ugen
-- og gør mest arbejde (ét AI-kald pr. virksomhed mod ai.gateway.lovable.dev,
-- generate-weekly-focus/index.ts:509). 150 s er samtidig platformens loft:
-- «Request idle timeout: 150s (If an Edge Function doesn't send a response
-- before the timeout, 504 Gateway Timeout will be returned)» — docs/functions/
-- limits. En timeout over 150 s køber intet; har funktionen brug for mere,
-- er svaret at dele arbejdet op i funktionen, ikke at vente længere.
--
-- GRÆNSEN, i koden: EN TIMEOUT MÅ ALDRIG VÆRE LÆNGERE END JOBBETS EGET
-- INTERVAL (plan-timeouten §6): ellers kan kørsel N stadig køre når N+1
-- starter — begge henter «de 50 ældste» og sender de samme mails. Funktionen
-- afviser derfor timeout_ms >= interval_ms når kalderen oplyser sit interval,
-- og alt over LOFTET (150 s) uanset. Standarden (30 s) er under det korteste
-- interval (5 min) med god margin.
--
-- DEL MED VAGTEN: kald_edge_standard_ms() og kald_edge_loft_ms() er små
-- funktioner, så vagt_cron (ottende version, det andet vindue) kan læse de
-- SAMME tal frem for at gætte 5 sekunder (dens v_svar_frist_min og
-- join-vinduet på 2 min antager 5 s — se plan-timeouten §4). SQL kan dele et
-- tal med SQL; det kunne TS↔SQL ikke (vagtens sjette version).
--
-- BIVIRKNING AF FORMEN: mangler nøglen i vault, kaster kald_edge en SQL-fejl
-- («kald_edge: email_queue_service_role_key mangler i vault») i stedet for at
-- sende «Bearer » og få 401 i otte timer som 9/9. En SQL-fejl i cron er RØD
-- hos vagten inden for en time. Det er ikke denne migrations formål, men det
-- er derfor RAISE står der.
--
-- ── DE TRETTEN NUVÆRENDE KOMMANDOER ──────────────────────────────────────
-- KRÆVER PROD: repoet er IKKE sandheden om cron (DEL 4: migrationshistorik er
-- ikke bevis for produktionens tilstand — daily-report-reminder og
-- generate-weekly-focus står i repoet med et vault-opslag af 'supabase_url',
-- som ikke findes, så prod-udgaven er en anden). Kør denne SELECT i Lovable →
-- SQL editor og indsæt outputtet ORDRET nedenfor under «FRA PROD», så enhver
-- kan genskabe hvert job tegn for tegn:
--
--   SELECT jobid, jobname, schedule, active,
--          (command LIKE '%net.http_post%')        AS http,
--          (command LIKE '%timeout_milliseconds%') AS saetter_timeout,
--          command
--   FROM cron.job
--   ORDER BY http DESC, schedule, jobname;
--   -- Forventet: 13 rækker (14 hvis onboarding-rytme er kørt), 9 med http = true,
--   -- 0 med saetter_timeout = true.
--
-- FRA PROD (indsættes ordret, med jobid og schedule):
--   [ikke hentet endnu — 10/9]
--
-- REPOETS UDGAVE (til orientering — IKKE prod; kilde pr. job):
--   process-notification-emails  */5 * * * *   20260901112000
--     SELECT net.http_post(url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/send-notification-email',
--       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')),
--       body := '{}'::jsonb);
--   intro-session-reminder       0 9 * * *     20260901112000   … /functions/v1/intro-reminder-cron, body '{"dry_run": false}'
--   daily-report-reminder        0 9 * * *     20260327094748   … url := (SELECT decrypted_secret … 'supabase_url') || '/functions/v1/send-report-reminder', body '{}'  ← IKKE prod-udgaven
--   event-reminders              0 7 * * *     20260810230000   … /functions/v1/event-reminders, body '{}'
--   generate-weekly-focus        0 6 * * 1     20260329192545   … url := (SELECT … 'supabase_url') || '/functions/v1/generate-weekly-focus', body '{}'  ← IKKE prod-udgaven
--   send-monthly-digest          0 8 22 * *    20260810230000   … /functions/v1/send-monthly-digest, body '{}'
--   indgangs-paamindelser        0 10 * * *    manuelt 3/9 (skabelon: indgangs-paamindelser-cron/index.ts:44)  … body '{"dry_run": false}'
--   fornyelsesvarsler            0 11 * * *    manuelt 7/9 kl. 14:51 (skabelon: fornyelsesvarsel-cron/index.ts:63)  … body '{"dry_run": false}'
--   slet-medlemsdata             0 12 * * *    manuelt 8/9 kl. 12:01  … /functions/v1/slet-medlemsdata-cron, body '{"dry_run": false}'
--   opgave-udloeb                0 4 * * *     20260901090000   UPDATE public.company_actions SET status = 'expired', closed_at = now() WHERE status = 'proposed' AND expires_at IS NOT NULL AND expires_at < now();
--   agent-runs-opbevaring        0 5 * * *     20260825233000   UPDATE public.agent_runs SET reasoning = NULL WHERE created_at < now() - interval '90 days' AND reasoning IS NOT NULL AND reasoning <> '[]'::jsonb; DELETE FROM public.agent_runs r WHERE r.created_at < now() - interval '12 months' AND NOT EXISTS (SELECT 1 FROM public.agent_proposals p WHERE p.run_id = r.id AND p.status IN ('approved','rejected'));
--   cleanup-stale-processing-reports */5 * * * * 20260901112000 SELECT public.cleanup_stale_processing_reports();
--   vagt-cron                    7 * * * *     20260909234500   SELECT public.vagt_cron();
--   (onboarding-rytme            15 9 * * *    20260909180000 — migrationen er IKKE kørt; findes ikke i prod)
--
-- ── DEPLOY ────────────────────────────────────────────────────────────────
-- Køres MANUELT i Lovable → SQL editor. Denne migration rører INGEN jobs.
-- Bagefter, MED DET SAMME, beviset uden at røre et job (punkt 3):
--
--   -- a) tallene står ét sted
--   SELECT public.kald_edge_standard_ms() AS standard_ms, public.kald_edge_loft_ms() AS loft_ms;   -- 30000, 150000
--
--   -- b) et tørt kald: indgangs-paamindelser-cron uden body er TØRKØRSEL (sender og skriver intet)
--   SELECT public.kald_edge('indgangs-paamindelser-cron') AS request_id;
--
--   -- c) svaret (vent 5–10 sekunder; rækken skrives når svaret kommer)
--   SELECT id, status_code, timed_out, error_msg, created, left(content, 200) AS content
--   FROM net._http_response ORDER BY id DESC LIMIT 1;
--   -- Forventet: status_code 200, timed_out false, content med "dry_run": true og fundet/ville_sende.
--
--   -- d) grænsen holder: begge skal FEJLE med kald_edge-teksten, intet sendes
--   SELECT public.kald_edge('indgangs-paamindelser-cron', '{}'::jsonb, 300000, 300000);  -- timeout >= interval
--   SELECT public.kald_edge('indgangs-paamindelser-cron', '{}'::jsonb, 200000);          -- over loftet
--
--   -- e) at timeouten faktisk sendes med: kun ved en timeout står tallet i teksten
--   --    («Timeout of 30000 ms reached …»). Kan også ses i køen i det øjeblik
--   --    rækken venter: SELECT id, url, timeout_milliseconds FROM net.http_request_queue ORDER BY id DESC LIMIT 3;
--   --    (rækker forsvinder når workeren har taget dem — kør den i samme sekund som b).
--
-- ── TIL VAGTENS OTTENDE VERSION (det andet vindue — rør ikke vagt_cron her) ──
-- To konstanter antager 5 sekunder og skal læse kald_edge_loft_ms() i stedet:
--   1. v_svar_frist_min (2 min): «undervejs» = intet svar endnu og yngre end
--      fristen. Med 150 s timeout har et lovligt kald intet svar i op til 150 s
--      → frist ≥ loftet + margin: fx ceil(kald_edge_loft_ms()/60000) + 1 = 4 min.
--   2. join-vinduet ko.start_time BETWEEN resp.created - interval '2 minutes'
--      AND resp.created: svarets created sættes når svaret KOMMER, dvs. op til
--      timeouten efter kørslens start → samme tal som 1, ellers mister vagten
--      koblingen kørsel↔svar og tæller svaret som «manuelt kald» (jobid NULL).
--   Begge kan skrives som make_interval(mins => v_svar_frist_min) med
--   v_svar_frist_min := ceil(public.kald_edge_loft_ms() / 60000.0)::integer + 1.
--   Bemærk: kald_edge findes først når DENNE migration er kørt — ottende
--   version må enten køres efter, eller bære tallet selv indtil da.

-- ── 1) Tallene — ét sted, læsbare af både kald_edge og vagten ──

CREATE OR REPLACE FUNCTION public.kald_edge_standard_ms()
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$ SELECT 30000 $$;

COMMENT ON FUNCTION public.kald_edge_standard_ms() IS
  'Standard-timeout (ms) for cron-jobbenes edge-kald via kald_edge. 30 s — afgjort af Jonas 10/9: langt nok til en kold start, langt fra det korteste interval (5 min). Ændres tallet, ændres det HER og ingen andre steder.';

CREATE OR REPLACE FUNCTION public.kald_edge_loft_ms()
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$ SELECT 150000 $$;

COMMENT ON FUNCTION public.kald_edge_loft_ms() IS
  'Øvre grænse (ms) for enhver timeout i kald_edge. 150 s = Supabase Edge Functions'' «Request idle timeout» (504 derefter) — mere køber intet. Vagten (vagt_cron) læser tallet til sin «undervejs»-frist og sit join-vindue.';

-- ── 2) Kaldet ──

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
  v_timeout integer;
  v_bearer text;
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

  RETURN net.http_post(
    url := v_rod || funktion,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_bearer
    ),
    body := COALESCE(body, '{}'::jsonb),
    timeout_milliseconds := v_timeout
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kald_edge(text, jsonb, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kald_edge(text, jsonb, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.kald_edge(text, jsonb, integer, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.kald_edge_standard_ms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kald_edge_loft_ms() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.kald_edge(text, jsonb, integer, integer) IS
  'Ét sted for cron-jobbenes edge-kald (10/9): URL-rod, vault-nøgle og timeout. Standard 30 s (kald_edge_standard_ms), loft 150 s (kald_edge_loft_ms). Afviser en timeout der ikke er kortere end det oplyste interval_ms — to kørsler af samme job må aldrig overlappe. Kaster hvis nøglen mangler i vault. Jobbene genplanlægges ét ad gangen: SELECT public.kald_edge(''<funktion>'', ''<body>''::jsonb, <timeout_ms|NULL>, <interval_ms>);';

-- ── 3) Efter-verifikation (kør i SQL editoren — se DEPLOY ovenfor) ──
SELECT public.kald_edge_standard_ms() AS standard_ms, public.kald_edge_loft_ms() AS loft_ms;
