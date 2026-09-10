-- Migration: vagtens join — trin 2 skannede cron.job_run_details én gang pr. svar.
--
-- MÅLT 10/9 (Lovable kørte funktionen for os): vagt_cron() TIMEDE UD. Ikke
-- alias-fejlen (20260910100000 er kørt og holder) — men:
--   cron.job_run_details havde 1.895.419 RÆKKER og KUN ét indeks:
--   primærnøglen på runid. Intet indeks på start_time.
-- Trin 2's korrelerede underforespørgsel (den der kobler hvert svar til den
-- cron-kørsel der startede ≤ 2 min før) kørte ÉN GANG PR. SVAR-RÆKKE: med
-- 12 svar tolv fulde gennemløb af 1,9 mio. rækker. Et indeks kan IKKE
-- oprettes: «must be owner of table job_run_details» — cron-tabellen ejes
-- af systemet.
--
-- HVAD VI LÆRTE — skrevet så det ikke sker igen:
--   1. cron.job_run_details KAN IKKE INDEKSERES af os. Alt der læser den skal
--      gå gennem primærnøglen (runid, bigserial): ORDER BY runid DESC LIMIT n
--      er en indeks-skanning baglæns; WHERE start_time > … er et fuldt
--      gennemløb, uanset hvor lille vinduet er.
--   2. Den voksede til 1,9 mio. af ét engangs-job pr. mailafsendelse: den
--      gamle afsender planlagde «SELECT public.email_queue_dispatch();» som
--      et NYT cron-job for hver afsendelse i stedet for ét gentagende. Hvert
--      job efterlod en række i job_run_details, og jobbene selv er væk.
--      Lovable ryddede 1.892.706 rækker 10/9 (jobs der ikke findes mere, og
--      alt over 30 dage). Oprydningen er IKKE en rettelse: tabellen vokser
--      igen med hver kørsel, og pg_cron rydder aldrig selv. Et purge-job
--      (DELETE … WHERE end_time < now() - interval '30 days') er en egen
--      beslutning og en egen migration — ikke denne.
--   3. EN VAGT MÅ ALDRIG AFHÆNGE AF AT DET DEN VAGTER, ER LILLE. Vagten
--      læser nu de seneste N kørsler gennem primærnøglen og filtrerer på tid
--      i hukommelsen; en tabel på 1,9 mio. eller 19 mio. koster det samme.
--   4. Tre versioner af én funktion på to dage, ingen af dem testet før prod
--      (20260910100000's punkt 6): plpgsql køres ikke af nogen test i huset.
--
-- HVAD DER ÆNDRES (kun trin 2 og 3; resten er ordret som 20260910100000):
--   ÉN JOIN i stedet for en underforespørgsel pr. række:
--     seneste  = de seneste v_koersler_loft (2000) rækker af job_run_details
--                via ORDER BY runid DESC LIMIT (primærnøglen).
--     koersler = dem af de 2000 der startede inden for 62 min (60 min svar-
--                vindue + de 2 min en kørsel må ligge før sit svar).
--     svar     = net._http_response de seneste 60 min LEFT JOIN koersler
--                ON start_time BETWEEN created - 2 min AND created.
--   FLERE KØRSLER INDEN FOR DE 2 MIN: DISTINCT ON (resp.id) … ORDER BY
--   resp.id, ko.start_time DESC NULLS LAST — hvert svar tæller præcis én gang,
--   og den NYESTE kørsel vinder, som den gamle ORDER BY … LIMIT 1 gjorde.
--   Resultatet er derfor det samme som før for hvert svar; kun prisen ændrer
--   sig. Trin 3 (kørsler og fejlede kørsler de seneste 60 min) regnes af den
--   SAMME mængde — ingen anden skanning af tabellen.
--
--   LOFTET (afgjort 10/9): 2000 kørsler. Normal drift er ~13 kørsler i timen
--   (ni jobs, process-notification-emails hvert 5. min, vagten selv), så 2000
--   dækker ~150 timer — og er stadig småt at hente via indekset. Rammes
--   loftet inden for vinduet (den ældste af de 2000 er yngre end 62 min), er
--   der kørsler vagten ikke ser; det står i tal som koersler_loft_ramt = true,
--   og dommen ændres ikke (et nyt engangs-job-pr.-mail ville vise sig sådan,
--   FØR det bliver 1,9 mio.). Forsidens linje kan senere vise det.
--
-- DEPLOY: køres MANUELT i Lovable → SQL editor. Bagefter, samme sted:
--   SELECT * FROM public.vagt_cron();               -- svarer på < 1 s, dom groen/gul
--   SELECT tal->'koersler_loft_ramt', tal->'koersler_60m', tal->'kald_60m'
--   FROM public.cron_vagt_log ORDER BY tid DESC LIMIT 1;
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT d.runid FROM cron.job_run_details d ORDER BY d.runid DESC LIMIT 2000;
--     -- forventet: Index Scan Backward using job_run_details_pkey, ikke Seq Scan

CREATE OR REPLACE FUNCTION public.vagt_cron()
RETURNS public.cron_vagt_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_noegle constant text := 'email_queue_service_role_key';
  v_koe_job constant text := 'process-notification-emails';
  v_vault integer;
  v_kald integer;
  v_ikke_200 integer;
  v_jobs_ikke_200 integer;
  v_ikke_200_uden_job integer;
  v_timeouts integer;
  v_koder jsonb;
  -- Loftet (10/9): de seneste N kørsler læses gennem primærnøglen (runid,
  -- bigserial, det ENESTE indeks), aldrig gennem start_time (intet indeks,
  -- kan ikke oprettes). 2000 er ~150 timers normal drift (13 kørsler/time)
  -- og stadig småt at hente; rammes loftet inden for 60 min, står det i tal.
  v_koersler_loft constant integer := 2000;
  v_koersler integer;
  v_koersler_fejlet integer;
  v_koersler_loft_ramt boolean;
  v_koe_job_aktiv boolean;
  v_usendte integer;
  v_aeldste_min integer;
  v_grunde text[] := '{}';
  v_dom text := 'groen';
  v_tal jsonb;
  v_titel text;
  v_tekster text[] := '{}';
  v_raekke public.cron_vagt_log;
  v_raadgiver record;
BEGIN
  -- 1. Vault: findes nøglen? (optælling — ingen dekryptering)
  SELECT count(*) INTO v_vault FROM vault.secrets s WHERE s.name = v_noegle;

  -- 2. Kørslerne ÉN gang: de seneste v_koersler_loft rækker gennem
  --    primærnøglen (ORDER BY runid DESC LIMIT — index scan baglæns), og
  --    FØRST DEREFTER filtreret på tid i hukommelsen. 62 min: svar-vinduet er
  --    60 min, og en kørsel kan ligge op til 2 min før sit svar. Loftet er
  --    ramt hvis den ældste af de N stadig ligger inde i vinduet — så mangler
  --    der kørsler, og det står i tal (koersler_loft_ramt).
  --    Svarene fra de seneste 60 min joines mod kørslerne ÉN gang; ligger
  --    to kørsler inden for de 2 min før et svar, vinder den nyeste
  --    (DISTINCT ON … ORDER BY start_time DESC) — samme valg som den gamle
  --    underforespørgsel, men uden ét gennemløb af tabellen pr. svar.
  --    Svar uden kørsel = manuelt kald (jobid NULL).
  WITH seneste AS (
    SELECT d.runid, d.jobid, d.status, d.start_time
    FROM cron.job_run_details d
    ORDER BY d.runid DESC
    LIMIT v_koersler_loft
  ),
  koersler AS (
    SELECT s.runid, s.jobid, s.status, s.start_time
    FROM seneste s
    WHERE s.start_time > now() - interval '62 minutes'
  ),
  svar AS (
    SELECT DISTINCT ON (resp.id)
           resp.id, resp.status_code, resp.timed_out, resp.error_msg, resp.created, ko.jobid
    FROM net._http_response resp
    LEFT JOIN koersler ko
      ON ko.start_time BETWEEN resp.created - interval '2 minutes' AND resp.created
    WHERE resp.created > now() - interval '60 minutes'
    ORDER BY resp.id, ko.start_time DESC NULLS LAST
  )
  SELECT count(*),
         count(*) FILTER (WHERE status_code IS DISTINCT FROM 200),
         count(DISTINCT jobid) FILTER (WHERE status_code IS DISTINCT FROM 200 AND jobid IS NOT NULL),
         count(*) FILTER (WHERE status_code IS DISTINCT FROM 200 AND jobid IS NULL),
         count(*) FILTER (WHERE timed_out),
         COALESCE((SELECT jsonb_object_agg(k, n) FROM (
            SELECT COALESCE(status_code::text, 'intet_svar') AS k, count(*) AS n FROM svar GROUP BY 1) x), '{}'::jsonb),
         -- 3. Kørslerne de seneste 60 min, og hvor mange SQL'en selv fejlede i —
         --    af den SAMME mængde, ingen ny skanning.
         (SELECT count(*) FROM koersler WHERE start_time > now() - interval '60 minutes'),
         (SELECT count(*) FROM koersler WHERE start_time > now() - interval '60 minutes' AND status = 'failed'),
         (SELECT COALESCE(count(*) = v_koersler_loft AND min(start_time) > now() - interval '62 minutes', false) FROM seneste)
  INTO v_kald, v_ikke_200, v_jobs_ikke_200, v_ikke_200_uden_job, v_timeouts, v_koder,
       v_koersler, v_koersler_fejlet, v_koersler_loft_ramt
  FROM svar;

  -- 4. Mailkøen: send-notification-emails eget filter, ældre end 30 min.
  SELECT j.active INTO v_koe_job_aktiv FROM cron.job j WHERE j.jobname = v_koe_job;
  SELECT count(*),
         COALESCE(floor(extract(epoch FROM (now() - min(n.created_at))) / 60)::integer, 0)
  INTO v_usendte, v_aeldste_min
  FROM public.notifications n
  WHERE n.email_sent_at IS NULL
    AND n.seen_at IS NULL
    AND n.priority IN ('action_required', 'important')
    AND n.type <> 'report_reminder'
    AND n.created_at < now() - interval '30 minutes';

  -- 5. Dommen. Rækkefølgen er alvorens: vault først.
  IF v_vault = 0 THEN
    v_grunde := v_grunde || 'vault_mangler';
    v_tekster := v_tekster || format('nøglen %s mangler i vault', v_noegle);
  END IF;
  IF v_jobs_ikke_200 >= 2 THEN
    v_grunde := v_grunde || 'flere_jobs_ikke_200';
    v_tekster := v_tekster || format('%s cron-jobs svarede ikke 200 den seneste time (%s)', v_jobs_ikke_200, v_koder::text);
  END IF;
  IF v_koersler_fejlet >= 1 THEN
    v_grunde := v_grunde || 'cron_koersel_fejlet';
    v_tekster := v_tekster || format('%s cron-kørsler fejlede i databasen den seneste time', v_koersler_fejlet);
  END IF;
  IF v_usendte >= 1 AND v_koe_job_aktiv IS TRUE THEN
    v_grunde := v_grunde || 'koe_staar_stille';
    v_tekster := v_tekster || format('%s mails venter i køen, den ældste i %s min', v_usendte, v_aeldste_min);
  END IF;
  IF array_length(v_grunde, 1) IS NOT NULL THEN
    v_dom := 'roed';
  ELSE
    IF v_koe_job_aktiv IS NULL THEN
      v_grunde := v_grunde || 'koe_job_mangler';
      v_dom := 'gul';
    ELSIF v_usendte >= 1 AND v_koe_job_aktiv IS FALSE THEN
      v_grunde := v_grunde || 'koe_pauset';
      v_dom := 'gul';
    END IF;
  END IF;

  v_tal := jsonb_build_object(
    'vault_noegler', v_vault,
    'kald_60m', v_kald,
    'ikke_200_60m', v_ikke_200,
    'jobs_ikke_200', v_jobs_ikke_200,
    'ikke_200_uden_job', v_ikke_200_uden_job,
    'timeouts_60m', v_timeouts,
    'koder', v_koder,
    'koersler_60m', v_koersler,
    'koersler_fejlet_60m', v_koersler_fejlet,
    'koersler_loft', v_koersler_loft,
    'koersler_loft_ramt', v_koersler_loft_ramt,
    'koe_job_aktiv', v_koe_job_aktiv,
    'usendte_30m', v_usendte,
    'aeldste_usendt_min', v_aeldste_min
  );

  INSERT INTO public.cron_vagt_log (dom, grunde, tal)
  VALUES (v_dom, v_grunde, v_tal)
  RETURNING * INTO v_raekke;

  -- 6. Ved RØD: én besked pr. rådgiver pr. årsag pr. døgn.
  IF v_dom = 'roed' THEN
    v_titel := 'Driften: ' || array_to_string(v_tekster, ' · ');
    FOR v_raadgiver IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.role IN ('advisor'::app_role, 'admin'::app_role)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.advisor_notifications a
        WHERE a.advisor_id = v_raadgiver.user_id AND a.type = 'drift' AND a.title = v_titel
          AND a.read_at IS NULL AND a.created_at > now() - interval '24 hours'
      ) THEN
        INSERT INTO public.advisor_notifications (type, title, body, member_id, advisor_id, reference_type, reference_id)
        VALUES ('drift', v_titel,
                'Cron-vagten (vagt_cron) kl. ' || to_char(now() AT TIME ZONE 'Europe/Copenhagen', 'HH24:MI') || '. Tallene: ' || v_tal::text,
                v_raadgiver.user_id, v_raadgiver.user_id, 'cron_vagt_log', NULL);
      END IF;
    END LOOP;
  END IF;

  RETURN v_raekke;
END;
$$;

-- Grants og kommentar som før (CREATE OR REPLACE bevarer grants — gentaget for læsbarhed).
REVOKE ALL ON FUNCTION public.vagt_cron() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vagt_cron() FROM anon;
REVOKE ALL ON FUNCTION public.vagt_cron() FROM authenticated;

COMMENT ON FUNCTION public.vagt_cron() IS
  'Cron-vagten (9/9; alias rettet 10/9; join + loft 10/9). Ren SQL uden HTTP og uden vault-nøglen. Læser cron.job_run_details KUN gennem primærnøglen (seneste 2000 kørsler) — tabellen kan ikke indekseres og har været 1,9 mio. rækker. Tæller vault.secrets, net._http_response (60 min, én join til kørslerne), fejlede cron-kørsler og mailkøen; skriver én række i cron_vagt_log og ved rød én advisor_notification pr. rådgiver pr. døgn.';
