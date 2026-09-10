-- Migration: vagtens timeouts — OTTENDE version.
--
-- MÅLT I PROD 10/9 kl. 12:28 (recon-timeoutens-pris, SQL 1): timeouts = 0
-- for ALLE jobs — ikke én række i net._http_response med timed_out = true,
-- heller ikke process-notification-emails med 35 kald. MEN en time før stod
-- ni rækker med error_msg «Timeout of 5000 ms reached. Total time: 5001.48
-- ms (DNS …)» og status_code NULL. pg_net skriver timeout-teksten i
-- error_msg UDEN at sætte timed_out (pg_nets kilde, core.c: timed_out
-- sættes kun når curl-koden er CURLE_OPERATION_TIMEDOUT — i prod's version
-- kommer teksten fra detailed_timeout_strerror, og kolonnen forbliver
-- false). De to felter er ikke enige, og vagten læste det forkerte.
--
-- FEJL 8 — TIMEOUTS BLEV TALT PÅ EN KOLONNE DER ALDRIG SÆTTES. Vagten var
-- bygget til at se præcis dette (9/9: «en cron der fejler tavst i otte
-- timer må ikke kunne ske igen»), og timeouts_60m ville altid have været
-- nul. Fundet ved at måle timeouts PR. JOB (recon-timeoutens-pris §1) og få
-- nul — selv om vi havde set dem i error_msg en time før. Dertil fejl 6's
-- «undervejs»-regel: den udelod rækker med status_code NULL yngre end to
-- minutter — og en timeout HAR status_code NULL. En timeout inden for de to
-- minutter blev derfor dømt «undervejs» og vejede ikke; efter to minutter
-- blev den til 'intet_svar' — talt som ikke-200, men aldrig som timeout.
--
-- AFGJORT:
--   1. Et svar er TIMET UD hvis timed_out ER true ELLER error_msg matcher
--      ~* '(timeout|timed out)'. Mønstret dækker pg_nets egen tekst
--      («Timeout of N ms reached») og curl's («Timeout was reached»,
--      «Resolving timed out after …», «Connection timed out after …»).
--   2. error_msg dømmes FØR alderen: en række med error_msg er AFGJORT, ikke
--      undervejs — uanset om den er 10 sekunder gammel. Undervejs er kun:
--      status_code NULL OG error_msg NULL OG NOT timed_out OG yngre end
--      fristen.
--   3. koder-objektet får to nye nøgler: 'timeout' og 'transportfejl'
--      (status NULL med en anden error_msg — DNS, connection refused, SSL),
--      så 'intet_svar' igen kun betyder «intet svar og ingen fejl».
--   4. Teksten på flere_jobs_ikke_200 bærer antallet af timeouts.
--   IKKE ændret: dommen. Timeouts tæller som ikke-200 (som de gjorde efter
--   to minutter) og udløser rødt ved ≥ 2 jobs. Ni timeouts på ÉT job i én
--   time (notifikationsjobbet hvert 5. min) er stadig ikke en grund i sig
--   selv — det er en beslutning om hvad rødt betyder, og den træffes sammen
--   med den nye timeout på kaldene (det andet vindue). Tallet er nu synligt:
--   timeouts_60m og koder.timeout.
--
-- DE OTTE FEJL, samlet: 1 alias · 2 timeout uden indeks · 3 array-
-- konkatenering · 4 NOT NULL læst i historikken · 5 (femte version:
-- egne fejl skilt fra) · 6 undervejs · 7 startup mod SQL · 8 timeouts på
-- en kolonne der ikke sættes. Otte versioner på to dage, ingen fundet af
-- en test. Fejl 8 er af en ny slags: ikke SQL der fejler, men SQL der
-- svarer forkert uden en lyd — og den blev kun fundet fordi tallet blev
-- målt mod noget vi havde set med egne øjne. Det er den slags fejl et
-- «grønt» svar aldrig afslører.
--
-- Alt andet ordret som 20260910160000 (syvende version). Grants gentages.
--
-- DEPLOY: køres MANUELT i Lovable → SQL editor. Bagefter, MED DET SAMME:
--   SELECT * FROM public.vagt_cron();
--     facit: tal->'timeouts_60m' = antallet af rækker den seneste time med
--     error_msg ~* 'timeout' (nul hvis den nye timeout på kaldene er sat og
--     virker), koder bærer 'timeout' i stedet for 'intet_svar' for dem.
--   -- Efterprøv reglen på de seneste 200 svar (punkt 5 i bestillingen):
--   SELECT count(*) FILTER (WHERE timed_out) AS kolonnen,
--          count(*) FILTER (WHERE error_msg ~* '(timeout|timed out)') AS teksten,
--          count(*) FILTER (WHERE COALESCE(timed_out,false) OR error_msg ~* '(timeout|timed out)') AS ny_regel,
--          count(*) FILTER (WHERE status_code IS NULL AND error_msg IS NOT NULL AND NOT (error_msg ~* '(timeout|timed out)')) AS transportfejl,
--          count(*) FILTER (WHERE status_code IS NULL AND error_msg IS NULL) AS intet_svar
--   FROM (SELECT * FROM net._http_response ORDER BY id DESC LIMIT 200) r;
--   SELECT DISTINCT left(error_msg, 60) FROM (SELECT * FROM net._http_response ORDER BY id DESC LIMIT 200) r
--   WHERE error_msg IS NOT NULL;   -- alle varianter af teksten, så mønstret kan efterprøves

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
  -- Fejlede kørsler deles (syvende version): SQL-fejl (jobbets egen — rød)
  -- og startup-fejl (pg_crons forbindelsesfejl — heler sig selv; gul ved
  -- gentagelse). Vagtens egne holdes ude af begge.
  v_koersler_fejlet integer;
  v_koersler_startup_fejl integer;
  v_startup_gul_fra constant integer := 3;
  v_vagt_selv_fejlet integer;
  -- Svar uden status_code er «undervejs» så længe de er nyere end dette
  -- (syvende version): pg_net skriver rækken før svaret kommer.
  v_svar_frist_min constant integer := 2;
  v_undervejs integer;
  v_vagt_jobid bigint;
  v_koersler_loft_ramt boolean;
  v_koe_job_aktiv boolean;
  -- MAILKØEN — motorens tal, ikke vagtens (sjette version, se filhovedet):
  --   v_motor_korteste_ventetid_min  = DEFAULT_EMAIL_DELAY_MINUTES (15): under
  --                                    det er en række ikke engang «ventende».
  --   v_motor_laengste_ventetid_min  = max(EMAIL_DELAY_MINUTES_BY_TYPE) (240):
  --                                    ÆNDRES 240 I MOTOREN, SKAL DETTE FØLGE.
  --   v_margin_min                   = 30: motoren kører hvert 5. min og
  --                                    tager 50 ad gangen; en halv time er
  --                                    rigeligt til at en forfalden række
  --                                    burde være taget.
  --   Vinduet 07–20 Europe/Copenhagen er motorens SEND_WINDOW; de første 30
  --   min efter kl. 07 dømmes ikke (nattens forfaldne skal have lov at gå).
  v_motor_korteste_ventetid_min constant integer := 15;
  v_motor_laengste_ventetid_min constant integer := 240;
  v_margin_min constant integer := 30;
  v_vindue_fra constant integer := 7;
  v_vindue_til constant integer := 20;
  v_vindue_opvarmning_min constant integer := 30;
  v_lokal timestamp;
  v_i_vindue boolean;
  v_min_siden_vinduestart integer;
  v_usendte integer;
  v_aeldste_min integer;
  v_forfaldne integer;
  v_aeldste_forfalden_min integer;
  v_motor_sidst_roert timestamptz;
  v_motor_sidst_roert_min integer;
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
    SELECT d.runid, d.jobid, d.status, d.start_time, d.command, d.return_message
    FROM cron.job_run_details d
    ORDER BY d.runid DESC
    LIMIT v_koersler_loft
  ),
  koersler AS (
    SELECT s.runid, s.jobid, s.status, s.start_time, s.command, s.return_message,
           -- pg_crons egne tekster ved forbindelsesfejl (syvende version).
           (s.return_message ILIKE '%job startup timeout%'
             OR s.return_message ILIKE '%connection failed%'
             OR s.return_message ILIKE '%connection lost%') AS startup_fejl
    FROM seneste s
    WHERE s.start_time > now() - interval '62 minutes'
  ),
  svar AS (
    SELECT DISTINCT ON (resp.id)
           resp.id, resp.status_code, resp.timed_out, resp.error_msg, resp.created, ko.jobid,
           -- TIMEOUT (ottende version): pg_net sætter IKKE timed_out i prod —
           -- teksten står i error_msg («Timeout of 5000 ms reached. Total
           -- time: …»), status_code NULL. curl's egne tekster hedder «Timeout
           -- was reached», «Resolving timed out after …», «Connection timed
           -- out after …». Én regel dækker dem alle: kolonnen ELLER ordet.
           (COALESCE(resp.timed_out, false) OR resp.error_msg ~* '(timeout|timed out)') AS er_timeout,
           -- AFGJORT: et svar med error_msg er afgjort — uanset alder. Kun en
           -- række uden status_code, uden error_msg og uden timed_out, der er
           -- yngre end fristen, er «undervejs» (syvende version, rækkefølgen
           -- rettet i ottende: teksten dømmes FØR alderen).
           (resp.status_code IS NULL
             AND resp.error_msg IS NULL
             AND NOT COALESCE(resp.timed_out, false)
             AND resp.created > now() - make_interval(mins => v_svar_frist_min)) AS undervejs
    FROM net._http_response resp
    LEFT JOIN koersler ko
      ON ko.start_time BETWEEN resp.created - interval '2 minutes' AND resp.created
    WHERE resp.created > now() - interval '60 minutes'
    ORDER BY resp.id, ko.start_time DESC NULLS LAST
  )
  SELECT count(*),
         count(*) FILTER (WHERE NOT undervejs AND status_code IS DISTINCT FROM 200),
         count(DISTINCT jobid) FILTER (WHERE NOT undervejs AND status_code IS DISTINCT FROM 200 AND jobid IS NOT NULL),
         count(*) FILTER (WHERE NOT undervejs AND status_code IS DISTINCT FROM 200 AND jobid IS NULL),
         count(*) FILTER (WHERE er_timeout),
         count(*) FILTER (WHERE undervejs),
         -- koder: kun AFGJORTE svar tæller under deres kode; de undervejs
         -- står under 'undervejs', så de kan ses uden at veje.
         COALESCE((SELECT jsonb_object_agg(k, n) FROM (
            SELECT CASE
                     WHEN undervejs THEN 'undervejs'
                     WHEN er_timeout THEN 'timeout'
                     WHEN status_code IS NULL AND error_msg IS NOT NULL THEN 'transportfejl'
                     ELSE COALESCE(status_code::text, 'intet_svar')
                   END AS k, count(*) AS n
            FROM svar GROUP BY 1) x), '{}'::jsonb),
         -- 3. Kørslerne de seneste 60 min, og hvor mange SQL'en selv fejlede i —
         --    af den SAMME mængde, ingen ny skanning.
         (SELECT count(*) FROM koersler WHERE start_time > now() - interval '60 minutes'),
         -- Vagtens egne kørsler kendes på KOMMANDOEN, ikke kun på jobid: et
         -- unschedule + schedule (som 20260909234500 gør) giver et nyt jobid,
         -- og de gamle fejlede rækker beholder det gamle (10/9: to «fremmede»
         -- fejl var vagten selv under sit forrige jobid).
         -- SQL-fejl i ANDRE jobs (rød) og startup-fejl i andre jobs (gul ved
         -- gentagelse) — hver for sig (syvende version).
         (SELECT count(*) FROM koersler WHERE start_time > now() - interval '60 minutes' AND status = 'failed'
            AND NOT startup_fejl
            AND jobid IS DISTINCT FROM v_vagt_jobid AND command NOT ILIKE '%vagt_cron%'),
         (SELECT count(*) FROM koersler WHERE start_time > now() - interval '60 minutes' AND status = 'failed'
            AND startup_fejl
            AND jobid IS DISTINCT FROM v_vagt_jobid AND command NOT ILIKE '%vagt_cron%'),
         (SELECT count(*) FROM koersler WHERE start_time > now() - interval '60 minutes' AND status = 'failed'
            AND (jobid = v_vagt_jobid OR command ILIKE '%vagt_cron%')),
         (SELECT COALESCE(count(*) = v_koersler_loft AND min(start_time) > now() - interval '62 minutes', false) FROM seneste)
  INTO v_kald, v_ikke_200, v_jobs_ikke_200, v_ikke_200_uden_job, v_timeouts, v_undervejs, v_koder,
       v_koersler, v_koersler_fejlet, v_koersler_startup_fejl, v_vagt_selv_fejlet, v_koersler_loft_ramt
  FROM svar;

  -- 4. Mailkøen — med MOTORENS regler (sjette version).
  --    4a. Vinduet: dansk lokal tid, som motorens copenhagenHour.
  v_lokal := now() AT TIME ZONE 'Europe/Copenhagen';
  v_i_vindue := extract(hour FROM v_lokal) >= v_vindue_fra AND extract(hour FROM v_lokal) < v_vindue_til;
  v_min_siden_vinduestart := floor(extract(epoch FROM (v_lokal - (date_trunc('day', v_lokal) + make_interval(hours => v_vindue_fra)))) / 60)::integer;

  SELECT j.active INTO v_koe_job_aktiv FROM cron.job j WHERE j.jobname = v_koe_job;

  --    4b. Ventende: send-notification-emails eget filter (email_sent_at,
  --        seen_at, prioritet, ikke report_reminder), ældre end motorens
  --        KORTESTE ventetid. Det er «venter» — ikke en fejl i sig selv.
  --    4c. Forfaldne: samme filter, men ældre end motorens LÆNGSTE ventetid
  --        plus margin. Uanset type burde motoren have taget dem.
  SELECT count(*) FILTER (WHERE n.created_at < now() - make_interval(mins => v_motor_korteste_ventetid_min)),
         COALESCE(floor(extract(epoch FROM (now() - min(n.created_at) FILTER (WHERE n.created_at < now() - make_interval(mins => v_motor_korteste_ventetid_min)))) / 60)::integer, 0),
         count(*) FILTER (WHERE n.created_at < now() - make_interval(mins => v_motor_laengste_ventetid_min + v_margin_min)),
         COALESCE(floor(extract(epoch FROM (now() - min(n.created_at) FILTER (WHERE n.created_at < now() - make_interval(mins => v_motor_laengste_ventetid_min + v_margin_min)))) / 60)::integer, 0)
  INTO v_usendte, v_aeldste_min, v_forfaldne, v_aeldste_forfalden_min
  FROM public.notifications n
  WHERE n.email_sent_at IS NULL
    AND n.seen_at IS NULL
    AND n.priority IN ('action_required', 'important')
    AND n.type <> 'report_reminder';

  --    4d. Hvornår rørte motoren sidst noget — det seneste af et stempel
  --        (email_sent_at, også dispose) og en sendt notifikationsmail. En
  --        FORKLARING i tallene (Jonas 10/9: «køen står stille» er den
  --        rigtige alarm), ikke en dom: står alt i sin egen ventetid, rører
  --        motoren legitimt intet i timer.
  SELECT greatest(
           (SELECT max(n.email_sent_at) FROM public.notifications n WHERE n.email_sent_at > now() - interval '7 days'),
           (SELECT max(l.created_at) FROM public.email_send_log l WHERE l.template_name LIKE 'notification-%' AND l.created_at > now() - interval '7 days')
         )
  INTO v_motor_sidst_roert;
  v_motor_sidst_roert_min := CASE WHEN v_motor_sidst_roert IS NULL THEN NULL
                                  ELSE floor(extract(epoch FROM (now() - v_motor_sidst_roert)) / 60)::integer END;

  -- 5. Dommen. Rækkefølgen er alvorens: vault først.
  IF v_vault = 0 THEN
    v_grunde := array_append(v_grunde, 'vault_mangler'::text);
    v_tekster := array_append(v_tekster, format('nøglen %s mangler i vault', v_noegle));
  END IF;
  IF v_jobs_ikke_200 >= 2 THEN
    v_grunde := array_append(v_grunde, 'flere_jobs_ikke_200'::text);
    v_tekster := array_append(v_tekster, format('%s cron-jobs svarede ikke 200 den seneste time (%s; %s timeouts)', v_jobs_ikke_200, v_koder::text, v_timeouts));
  END IF;
  -- Kun SQL-fejl er røde: jobbets egen fejl, som kommer igen hver gang.
  -- Startup-fejl (pg_crons forbindelsesfejl) heler sig selv og dømmes nedenfor.
  IF v_koersler_fejlet >= 1 THEN
    v_grunde := array_append(v_grunde, 'cron_koersel_fejlet'::text);
    v_tekster := array_append(v_tekster, format('%s cron-kørsler fejlede med en SQL-fejl den seneste time — ikke vagten selv, ikke startup-timeout', v_koersler_fejlet));
  END IF;
  -- Køen står stille KUN når: der er forfaldne (ældre end motorens længste
  -- ventetid + margin), jobbet er aktivt, vi er i motorens vindue, og
  -- vinduet har været åbent længe nok til at nattens forfaldne kunne gå.
  IF v_forfaldne >= 1 AND v_koe_job_aktiv IS TRUE AND v_i_vindue AND v_min_siden_vinduestart >= v_vindue_opvarmning_min THEN
    v_grunde := array_append(v_grunde, 'koe_staar_stille'::text);
    v_tekster := array_append(v_tekster, format(
      '%s mails er ældre end motorens længste ventetid (%s + %s min) og stadig usendt, den ældste i %s min — motoren rørte sidst noget for %s min siden',
      v_forfaldne, v_motor_laengste_ventetid_min, v_margin_min, v_aeldste_forfalden_min, COALESCE(v_motor_sidst_roert_min::text, 'ukendt')));
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
    -- Startup-timeouts: ét eller to på en time er serveren der trækker
    -- vejret — kun i tal. Tre eller flere er et mønster værd at kigge på,
    -- men ikke en fejl i et job: GUL, aldrig rød.
    IF v_koersler_startup_fejl >= v_startup_gul_fra THEN
      v_grunde := array_append(v_grunde, 'cron_startup_gentaget'::text);
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
    -- koersler_fejlet_60m bevares (forsidens linje læser den) = SQL-fejl.
    'koersler_fejlet_60m', v_koersler_fejlet,
    'koersler_sql_fejl_60m', v_koersler_fejlet,
    'koersler_startup_fejl_60m', v_koersler_startup_fejl,
    'startup_gul_fra', v_startup_gul_fra,
    'vagt_selv_fejlet_60m', v_vagt_selv_fejlet,
    'undervejs_60m', v_undervejs,
    'svar_frist_min', v_svar_frist_min,
    'koersler_loft', v_koersler_loft,
    'koersler_loft_ramt', v_koersler_loft_ramt,
    'koe_job_aktiv', v_koe_job_aktiv,
    -- De to gamle nøgler bevares (forsidens linje læser dem): «venter» = ældre end motorens korteste ventetid.
    'usendte_30m', v_usendte,
    'aeldste_usendt_min', v_aeldste_min,
    'usendte_taerskel_min', v_motor_korteste_ventetid_min,
    'forfaldne', v_forfaldne,
    'aeldste_forfalden_min', v_aeldste_forfalden_min,
    'forfaldne_taerskel_min', v_motor_laengste_ventetid_min + v_margin_min,
    'i_vindue', v_i_vindue,
    'min_siden_vinduestart', v_min_siden_vinduestart,
    'motor_sidst_roert_min', v_motor_sidst_roert_min
  );

  INSERT INTO public.cron_vagt_log (dom, grunde, tal)
  VALUES (v_dom, v_grunde, v_tal)
  RETURNING * INTO v_raekke;

  -- 6. Ved RØD: én besked pr. rådgiver pr. årsag pr. døgn. company_id er
  --    NULL — en driftsbesked handler ikke om en virksomhed (kolonnen gjort
  --    nullable i 20260910140000). Blokken har sin egen EXCEPTION: fejler
  --    budbringeren, må dommen og loggen ALDRIG rulles tilbage med den.
  --    Fejlen skrives i stedet ind i rækkens tal som notifikation_fejl.
  IF v_dom = 'roed' THEN
    BEGIN
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
          INSERT INTO public.advisor_notifications (type, title, body, company_id, member_id, advisor_id, reference_type, reference_id)
          VALUES ('drift', v_titel,
                  'Cron-vagten (vagt_cron) kl. ' || to_char(now() AT TIME ZONE 'Europe/Copenhagen', 'HH24:MI') || '. Tallene: ' || v_tal::text,
                  NULL, v_raadgiver.user_id, v_raadgiver.user_id, 'cron_vagt_log', NULL);
        END IF;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_raekke.tal := v_raekke.tal || jsonb_build_object('notifikation_fejl', SQLERRM);
      UPDATE public.cron_vagt_log SET tal = v_raekke.tal WHERE id = v_raekke.id;
    END;
  END IF;

  RETURN v_raekke;
END;
$$;

REVOKE ALL ON FUNCTION public.vagt_cron() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vagt_cron() FROM anon;
REVOKE ALL ON FUNCTION public.vagt_cron() FROM authenticated;

COMMENT ON FUNCTION public.vagt_cron() IS
  'Cron-vagten (9/9; ottende version 10/9: timeouts tælles på timed_out ELLER error_msg ~* timeout — kolonnen sættes ikke af pg_net i prod; error_msg dømmes før alderen, så en timeout aldrig er «undervejs»; koder kender timeout og transportfejl). Ren SQL uden HTTP og uden vault-nøglen. Læser cron.job_run_details KUN gennem primærnøglen (seneste 2000). Tæller vault.secrets, net._http_response (60 min, én join), fejlede cron-kørsler (SQL-fejl rød, startup-fejl gul ved ≥ 3, vagtens egne holdt ude) og mailkøen (motorens 240 + 30 min, 07–20); skriver én række i cron_vagt_log og ved rød én advisor_notification (company_id NULL) pr. rådgiver pr. døgn, i egen EXCEPTION-blok.';
