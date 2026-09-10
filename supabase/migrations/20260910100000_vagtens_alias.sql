-- Migration: vagtens alias — vagt_cron() fejlede hver time i prod.
--
-- MÅLT 10/9: 20260909234500_cron_vagten.sql er kørt, tabellen og jobbet
-- 'vagt-cron' findes, men hver kørsel gav
--   ERROR: 55000: record "r" is not assigned yet
--   CONTEXT: SQL statement "WITH svar AS (SELECT r.id, r.status_code, ...
--
-- ÅRSAGEN: plpgsql-variablen `r record` (loop-variablen til rådgiverne)
-- delte navn med TABELALIASSET `r` for net._http_response i CTE'en. Plpgsql
-- løser navne FØR SQL'en ser dem: `r.id` blev læst som variablens felt, og
-- variablen var ikke tildelt endnu. En variabel og et alias med samme navn
-- er en fælde uanset hvor sigende aliaset er.
--
-- HVER FOREKOMST AF `r` I DEN GAMLE FUNKTION:
--   :122  `r record;`                              — VARIABLEN (deklaration)
--   :130  `SELECT r.id, r.status_code, r.timed_out, r.error_msg, r.created`
--                                                  — ALIAS for net._http_response (ramt: læst som variablen)
--   :132  `BETWEEN r.created - interval '2 minutes' AND r.created`  — samme alias
--   :134  `FROM net._http_response r`               — aliassets definition
--   :135  `WHERE r.created > now() - interval '60 minutes'`         — samme alias
--   :217  `FOR r IN SELECT DISTINCT ur.user_id FROM public.user_roles ur`  — VARIABLEN (loop)
--   :223  `WHERE a.advisor_id = r.user_id`          — VARIABLEN (loopets felt)
--   :229  `r.user_id, r.user_id, 'cron_vagt_log', NULL`               — VARIABLEN
--
-- RETTELSEN: variablen hedder v_raadgiver (som alle andre variabler bærer
-- v_-præfikset, der ikke kan kollidere med et alias), og svarrækkerne i
-- CTE'en hedder resp. Alt andet er ordret som før.
--
-- FLERE AF SAMME SLAGS? Gennemgået 10/9: de øvrige variabler er alle
-- v_-præfiksede (v_noegle … v_raekke); aliasserne er s (vault.secrets),
-- d (cron.job_run_details, to steder), j (cron.job), n (notifications),
-- ur (user_roles), a (advisor_notifications), svar (CTE), x (delforespørgsel)
-- og kolonnenavnene k/n i jsonb_object_agg — ingen af dem er variabler.
-- get_cron_vagt() er LANGUAGE sql (ingen plpgsql-variabler); dens
-- RETURNS TABLE-kolonner (id, tid, dom, grunde, tal) og aliasset l kan ikke
-- kollidere. `r` var den eneste.
--
-- Den gamle fil er historik og rettes ikke; denne erstatter KUN funktionen.
--
-- DEPLOY: køres MANUELT i Lovable → SQL editor. Bagefter, samme sted:
--   SELECT * FROM public.vagt_cron();
--     facit 10/9 formiddag: dom 'groen' eller 'gul' (notifikationsjobbet
--     kører igen siden 08:57, køen falder — 'koe_pauset' gælder ikke længere;
--     'koe_staar_stille' kan stå gul→rød mens køen tømmes 50 ad gangen)
--   SELECT tid, dom, grunde, tal FROM public.cron_vagt_log ORDER BY tid DESC LIMIT 3;
--   SELECT status, return_message, start_time FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'vagt-cron')
--   ORDER BY start_time DESC LIMIT 3;   -- næste time: 'succeeded' UDEN fejltekst

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
  v_koersler integer;
  v_koersler_fejlet integer;
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

  -- 2. Svarene de seneste 60 min, hver koblet til den cron-kørsel der startede
  --    ≤ 2 min før svaret (nyeste først). Svar uden kørsel = manuelt kald.
  WITH svar AS (
    SELECT resp.id, resp.status_code, resp.timed_out, resp.error_msg, resp.created,
           (SELECT d.jobid FROM cron.job_run_details d
             WHERE d.start_time BETWEEN resp.created - interval '2 minutes' AND resp.created
             ORDER BY d.start_time DESC LIMIT 1) AS jobid
    FROM net._http_response resp
    WHERE resp.created > now() - interval '60 minutes'
  )
  SELECT count(*),
         count(*) FILTER (WHERE status_code IS DISTINCT FROM 200),
         count(DISTINCT jobid) FILTER (WHERE status_code IS DISTINCT FROM 200 AND jobid IS NOT NULL),
         count(*) FILTER (WHERE status_code IS DISTINCT FROM 200 AND jobid IS NULL),
         count(*) FILTER (WHERE timed_out),
         COALESCE((SELECT jsonb_object_agg(k, n) FROM (
            SELECT COALESCE(status_code::text, 'intet_svar') AS k, count(*) AS n FROM svar GROUP BY 1) x), '{}'::jsonb)
  INTO v_kald, v_ikke_200, v_jobs_ikke_200, v_ikke_200_uden_job, v_timeouts, v_koder
  FROM svar;

  -- 3. Cron-kørsler de seneste 60 min, og hvor mange SQL'en selv fejlede i.
  SELECT count(*), count(*) FILTER (WHERE d.status = 'failed')
  INTO v_koersler, v_koersler_fejlet
  FROM cron.job_run_details d
  WHERE d.start_time > now() - interval '60 minutes';

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

-- Grants som før (CREATE OR REPLACE bevarer dem — gentaget for læsbarhed og sikkerhed).
REVOKE ALL ON FUNCTION public.vagt_cron() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vagt_cron() FROM anon;
REVOKE ALL ON FUNCTION public.vagt_cron() FROM authenticated;

COMMENT ON FUNCTION public.vagt_cron() IS
  'Cron-vagten (9/9, rettet 10/9: variabel r kolliderede med alias r). Ren SQL uden HTTP og uden vault-nøglen. Tæller vault.secrets, net._http_response (60 min, tids-join til cron.job_run_details), fejlede cron-kørsler og mailkøen; skriver én række i cron_vagt_log og ved rød én advisor_notification pr. rådgiver pr. døgn.';
