-- Migration: vagtens array — fjerde version på to dage.
--
-- MÅLT I PROD 10/9, efter at joinen (20260910120000) er kørt og holder:
--   ERROR: 22P02: malformed array literal: "cron_koersel_fejlet"
--   DETAIL: Array value must start with "{" or dimension information.
--   QUERY: v_grunde := v_grunde || 'cron_koersel_fejlet'
--
-- ÅRSAGEN: `text[] || 'literal'` er tvetydig. Literalen er af typen unknown,
-- og Postgres vælger operatoren anyarray || anyarray og prøver at læse
-- strengen som et array-literal — som ikke starter med «{». Med et typet
-- element (format(...) returnerer text) vælges anyarray || anyelement, og
-- det gik fint; derfor fejlede kun v_grunde-linjerne, aldrig v_tekster.
-- Rettelsen: array_append(v_grunde, 'kode'::text) alle seks steder — og for
-- ensartethed også de fire v_tekster-linjer. array_append er utvetydig.
--
-- HVORFOR DE FIRE FØRSTE GRENE «GIK IGENNEM»: de blev aldrig ramt. Nøglen
-- var i vault (v_vault = 1), ingen to jobs svarede ikke-200 (nøglen virker
-- siden 9/9 kl. 23:50), så første tilføjelse til v_grunde der faktisk blev
-- UDFØRT var cron_koersel_fejlet — og den fejlede med det samme. Fejlen lå i
-- alle seks linjer fra første version; den blev synlig da en gren blev ramt.
--
-- FIRE VERSIONER PÅ TO DAGE, alle fejl kun fundet i prod:
--   20260909234500  vagten bygget — variabel `r` kolliderede med alias `r`
--                   (record "r" is not assigned yet).
--   20260910100000  alias rettet — timede ud: korreleret underforespørgsel
--                   mod cron.job_run_details (1,9 mio. rækker, intet indeks
--                   på start_time, kan ikke oprettes).
--   20260910120000  én join + loft gennem primærnøglen — nåede dommen, og
--                   faldt på array-konkateneringen.
--   20260910130000  (denne) array_append, og vagtens egne fejl skilt fra.
-- Ingen test i huset kører plpgsql (2451 tests, nul af dem). Hver version
-- var «grøn» lokalt fordi lokalt ikke findes for SQL. Det der ville have
-- fanget alle fire: at køre `SELECT * FROM public.vagt_cron()` i SQL-
-- editoren LIGE EFTER migrationen — det står i hvert filhoved og blev
-- sprunget over hver gang. Guard-testen på variabel/alias fangede kun den
-- første slags.
--
-- HVAD FEJLEN FORTÆLLER (punkt 5): grenen cron_koersel_fejlet blev ramt, så
-- vagten HAVDE fundet mindst én fejlet cron-kørsel i timen før — det er
-- formentlig vagten selv, fra timeouts og array-fejlen. AFGJORT: dommen
-- skelner nu. Fejlede kørsler af vagtens EGET job (jobid = 'vagt-cron')
-- tælles for sig i tal (vagt_selv_fejlet_60m) og gør ikke dommen rød. Fejler
-- vagten, skriver den ingen række, og forsidens linje siger af sig selv
-- «vagten har ikke kørt siden kl. X — cron kører ikke» (cronVagt.ts) — det
-- er det rigtige signal for den fejl. En vagt der melder sin egen fejl som
-- driftsfejl, er støj — og ville have været rød i den første time efter
-- denne rettelse, for timeouts fra i formiddags.
--
-- Alt andet er ordret som 20260910120000 (joinen, loftet, dommen, loggen,
-- beskederne). Grants og kommentar gentages.
--
-- DEPLOY: køres MANUELT i Lovable → SQL editor. Bagefter, samme sted, MED
-- DET SAMME (fjerde gang — kør den nu):
--   SELECT * FROM public.vagt_cron();
--     facit: én række, dom 'groen' (eller 'gul' hvis køen er sat på pause),
--     tal->'vagt_selv_fejlet_60m' > 0 (formiddagens timeouts), tal->'koersler_fejlet_60m' = 0.
--   SELECT status, return_message FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'vagt-cron')
--   ORDER BY start_time DESC LIMIT 2;  -- næste time: 'succeeded' uden fejltekst

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
  -- Fejlede kørsler af ANDRE jobs end vagten selv — vagtens egne fejl
  -- tælles for sig (v_vagt_selv_fejlet) og gør ikke dommen rød: fejler
  -- vagten, skriver den ingen række, og forsidens linje siger «vagten har
  -- ikke kørt siden kl. X» af sig selv (cronVagt.ts). At rapportere sin
  -- egen fejl som driftsfejl er støj (10/9: den ramte cron_koersel_fejlet
  -- på sine egne timeouts fra timerne før).
  v_koersler_fejlet integer;
  v_vagt_selv_fejlet integer;
  v_vagt_jobid bigint;
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
  -- Vagtens eget jobid, så dens egne kørsler kan skilles fra (NULL hvis jobbet ikke findes).
  SELECT j.jobid INTO v_vagt_jobid FROM cron.job j WHERE j.jobname = 'vagt-cron';

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
  --    Trin 3 tæller fejlede kørsler UDEN vagtens egne (jobid = vagt-cron):
  --    de står for sig i tal (vagt_selv_fejlet_60m).
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
         (SELECT count(*) FROM koersler WHERE start_time > now() - interval '60 minutes' AND status = 'failed' AND jobid IS DISTINCT FROM v_vagt_jobid),
         (SELECT count(*) FROM koersler WHERE start_time > now() - interval '60 minutes' AND status = 'failed' AND jobid = v_vagt_jobid),
         (SELECT COALESCE(count(*) = v_koersler_loft AND min(start_time) > now() - interval '62 minutes', false) FROM seneste)
  INTO v_kald, v_ikke_200, v_jobs_ikke_200, v_ikke_200_uden_job, v_timeouts, v_koder,
       v_koersler, v_koersler_fejlet, v_vagt_selv_fejlet, v_koersler_loft_ramt
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
    v_grunde := array_append(v_grunde, 'vault_mangler'::text);
    v_tekster := array_append(v_tekster, format('nøglen %s mangler i vault', v_noegle));
  END IF;
  IF v_jobs_ikke_200 >= 2 THEN
    v_grunde := array_append(v_grunde, 'flere_jobs_ikke_200'::text);
    v_tekster := array_append(v_tekster, format('%s cron-jobs svarede ikke 200 den seneste time (%s)', v_jobs_ikke_200, v_koder::text));
  END IF;
  IF v_koersler_fejlet >= 1 THEN
    v_grunde := array_append(v_grunde, 'cron_koersel_fejlet'::text);
    v_tekster := array_append(v_tekster, format('%s cron-kørsler fejlede i databasen den seneste time — ikke vagten selv', v_koersler_fejlet));
  END IF;
  IF v_usendte >= 1 AND v_koe_job_aktiv IS TRUE THEN
    v_grunde := array_append(v_grunde, 'koe_staar_stille'::text);
    v_tekster := array_append(v_tekster, format('%s mails venter i køen, den ældste i %s min', v_usendte, v_aeldste_min));
  END IF;
  IF array_length(v_grunde, 1) IS NOT NULL THEN
    v_dom := 'roed';
  ELSE
    IF v_koe_job_aktiv IS NULL THEN
      v_grunde := array_append(v_grunde, 'koe_job_mangler'::text);
      v_dom := 'gul';
    ELSIF v_usendte >= 1 AND v_koe_job_aktiv IS FALSE THEN
      v_grunde := array_append(v_grunde, 'koe_pauset'::text);
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
    'vagt_selv_fejlet_60m', v_vagt_selv_fejlet,
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

REVOKE ALL ON FUNCTION public.vagt_cron() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vagt_cron() FROM anon;
REVOKE ALL ON FUNCTION public.vagt_cron() FROM authenticated;

COMMENT ON FUNCTION public.vagt_cron() IS
  'Cron-vagten (9/9; fjerde version 10/9: alias, join+loft, array_append, egne fejl skilt fra). Ren SQL uden HTTP og uden vault-nøglen. Læser cron.job_run_details KUN gennem primærnøglen (seneste 2000). Tæller vault.secrets, net._http_response (60 min, én join), fejlede cron-kørsler (uden vagtens egne) og mailkøen; skriver én række i cron_vagt_log og ved rød én advisor_notification pr. rådgiver pr. døgn.';
