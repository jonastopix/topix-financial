-- Migration: cron-vagten — ren SQL, ingen HTTP, ingen vault-nøgle.
--
-- BAGGRUND (9/9): vault.secrets var tom fra formentlig kl. 06:52 (Lovables
-- mailopdatering). Alle ni cron-jobs sendte «Bearer » uden nøgle og fik 401 —
-- 77 kald, nul med 200 — og INGEN opdagede det før kl. 23:39, da en tørkørsel
-- af onboardingens rytme fejlede. cron.job_run_details sagde «succeeded» for
-- dem alle: det betyder KUN at net.http_post blev afsendt. Nøglen blev
-- genskabt kl. 23:50. Vagten bygges nu, mens alt er grønt.
--
-- DET AFGØRENDE KRAV: vagten må IKKE bruge det den vagter. Ingen
-- net.http_post, ingen vault-opslag af nøglen (kun en OPTÆLLING i
-- vault.secrets — den dekrypterer intet), ingen edge function. Den skal
-- virke netop når alt andet er nede. pg_cron kører den som postgres, uden om
-- RLS, inde i databasen.
--
-- HVAD DEN DØMMER (analyse-cron-vagten.md §7), hver time, syv over hel:
--   RØD  vault_mangler         count(vault.secrets WHERE name = nøglen) = 0
--   RØD  flere_jobs_ikke_200   svar ≠ 200 i net._http_response de seneste 60
--                              min fra ≥ 2 forskellige cron-jobs (tids-join
--                              mod cron.job_run_details: kørsel startet ≤ 2
--                              min før svaret). Ét job der hikker, er ikke
--                              drift; to der fejler ens, er én årsag.
--   RØD  cron_koersel_fejlet   cron.job_run_details.status = 'failed' de
--                              seneste 60 min (SQL'en i jobbet fejlede — fx et
--                              vault-opslag der gav NULL, som 10/8).
--   RØD  koe_staar_stille      notifications der opfylder
--                              send-notification-emails eget filter
--                              (email_sent_at og seen_at NULL, priority i
--                              action_required/important, type ≠
--                              report_reminder) og er ældre end 30 MIN — OG
--                              jobbet process-notification-emails er aktivt.
--                              30 og ikke 15: funktionens eget forfilter er
--                              15 min og den kører hvert 5. min, så en række
--                              på 15–20 min er NORMAL; 30 er 15 + 5 + margen.
--   GUL  koe_pauset            samme kø, men jobbet er sat på pause (cron.job.
--                              active = false). AFGJORT 9/9: en pause er et
--                              VALG — rød betyder «noget gik i stykker som
--                              ingen valgte». Men den skal ses, så den ikke
--                              glemmes: gul, med tallet.
--   GUL  koe_job_mangler       jobbet findes slet ikke i cron.job.
--   GRØN ellers.
--
-- HVAD DEN SKRIVER: én række pr. kørsel i public.cron_vagt_log (tid, dom,
-- grunde, tallene som jsonb) — så døgnet findes uanset at pg_net rydder
-- net._http_response efter ~6 timer. Det var netop dét der gjorde at vi ikke
-- kunne fastslå hvornår nøglen forsvandt. Ved RØD desuden én række i
-- advisor_notifications pr. rådgiver (type 'drift'), medmindre en ULÆST med
-- samme titel findes fra de sidste 24 timer — én besked pr. årsag pr. døgn,
-- ikke én pr. kørsel.
--
-- HVAD DEN IKKE GØR (bevidst, første version): parser ikke cron-planer («job
-- der ikke kørte i sit vindue»), poster ikke til Slack (kræver en hemmelighed),
-- kobler ikke svar til job med eksakt request-id (kræver at de ni jobs
-- gen-scheduleres gennem en wrapper — næste skridt).
--
-- FLADEN: get_cron_vagt() (advisor-only, get_siden_sidst-mønstret) læses af
-- forsidens højre spalte — «Driften: alt svarede 200 det sidste døgn», eller
-- den røde linje. Uden linjen er vagten en tabel ingen ser.
--
-- DEPLOY: køres MANUELT i Lovable → SQL editor (dikteres separat). Bagefter:
--   SELECT * FROM public.vagt_cron();                      -- én række, dom 'groen' når nøglen er tilbage
--   SELECT * FROM public.cron_vagt_log ORDER BY tid DESC LIMIT 3;
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'vagt-cron';
-- Bevis for at den ville have set 9/9: kør den i en time med 401-svar i vinduet
-- (eller fremkald ét 401 fra to jobs med en ugyldig header) → dom 'roed',
-- grunde {flere_jobs_ikke_200}.

-- ── 1) Loggen ──

CREATE TABLE IF NOT EXISTS public.cron_vagt_log (
  id bigserial PRIMARY KEY,
  tid timestamptz NOT NULL DEFAULT now(),
  dom text NOT NULL CHECK (dom IN ('groen', 'gul', 'roed')),
  grunde text[] NOT NULL DEFAULT '{}',
  tal jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS cron_vagt_log_tid_idx ON public.cron_vagt_log (tid DESC);

COMMENT ON TABLE public.cron_vagt_log IS
  'Cron-vagtens dom hver time (vagt_cron, 9/9): groen/gul/roed, grundene som koder, tallene som jsonb. Skrives kun af vagt_cron (postgres via pg_cron); rådgivere læser via get_cron_vagt.';

ALTER TABLE public.cron_vagt_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Advisors can read cron vagt log" ON public.cron_vagt_log;
CREATE POLICY "Advisors can read cron vagt log"
  ON public.cron_vagt_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

-- Ingen INSERT/UPDATE/DELETE-policy for klienter: kun vagten skriver.

-- ── 2) Vagten ──

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
  r record;
BEGIN
  -- 1. Vault: findes nøglen? (optælling — ingen dekryptering)
  SELECT count(*) INTO v_vault FROM vault.secrets s WHERE s.name = v_noegle;

  -- 2. Svarene de seneste 60 min, hver koblet til den cron-kørsel der startede
  --    ≤ 2 min før svaret (nyeste først). Svar uden kørsel = manuelt kald.
  WITH svar AS (
    SELECT r.id, r.status_code, r.timed_out, r.error_msg, r.created,
           (SELECT d.jobid FROM cron.job_run_details d
             WHERE d.start_time BETWEEN r.created - interval '2 minutes' AND r.created
             ORDER BY d.start_time DESC LIMIT 1) AS jobid
    FROM net._http_response r
    WHERE r.created > now() - interval '60 minutes'
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
    FOR r IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.role IN ('advisor'::app_role, 'admin'::app_role)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.advisor_notifications a
        WHERE a.advisor_id = r.user_id AND a.type = 'drift' AND a.title = v_titel
          AND a.read_at IS NULL AND a.created_at > now() - interval '24 hours'
      ) THEN
        INSERT INTO public.advisor_notifications (type, title, body, member_id, advisor_id, reference_type, reference_id)
        VALUES ('drift', v_titel,
                'Cron-vagten (vagt_cron) kl. ' || to_char(now() AT TIME ZONE 'Europe/Copenhagen', 'HH24:MI') || '. Tallene: ' || v_tal::text,
                r.user_id, r.user_id, 'cron_vagt_log', NULL);
      END IF;
    END LOOP;
  END IF;

  RETURN v_raekke;
END;
$$;

-- Kun pg_cron (postgres) må køre vagten — aldrig en klient.
REVOKE ALL ON FUNCTION public.vagt_cron() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vagt_cron() FROM anon;
REVOKE ALL ON FUNCTION public.vagt_cron() FROM authenticated;

COMMENT ON FUNCTION public.vagt_cron() IS
  'Cron-vagten (9/9): ren SQL uden HTTP og uden vault-nøglen. Tæller vault.secrets, net._http_response (60 min, tids-join til cron.job_run_details), fejlede cron-kørsler og mailkøen; skriver én række i cron_vagt_log og ved rød én advisor_notification pr. rådgiver pr. døgn. Se migrationens hoved for reglerne.';

-- ── 3) Planen: syv over hel, EFTER jobs på hel time ──

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vagt-cron') THEN
    PERFORM cron.unschedule('vagt-cron');
  END IF;
END $$;

SELECT cron.schedule(
  'vagt-cron',
  '7 * * * *',
  $job$SELECT public.vagt_cron();$job$
);

-- ── 4) Fladens læsning: seneste døgn, advisor-only ──

CREATE OR REPLACE FUNCTION public.get_cron_vagt()
RETURNS TABLE (id bigint, tid timestamptz, dom text, grunde text[], tal jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.tid, l.dom, l.grunde, l.tal
  FROM public.cron_vagt_log l
  WHERE public.has_role(auth.uid(), 'advisor'::app_role)
    AND l.tid > now() - interval '24 hours'
  ORDER BY l.tid DESC
$$;

REVOKE ALL ON FUNCTION public.get_cron_vagt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cron_vagt() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_cron_vagt() TO authenticated;

COMMENT ON FUNCTION public.get_cron_vagt() IS
  'Advisor-only by design (has_role i WHERE — nul rækker for andre). Cron-vagtens rækker fra de sidste 24 timer, nyeste først. Formuleringen bor i src/lib/cronVagt.ts.';
