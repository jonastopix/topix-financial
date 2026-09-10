-- Migration: vagtens tærskel — SJETTE version.
--
-- HVORFOR: vagten og mail-motoren var UENIGE om hvad «for længe» er.
-- Målt i prod 10/9 kl. 11:27 dansk, på vagtens første fungerende kørsel:
-- «1 mails venter i køen, den ældste i 141 min» — en alert_financial_summary
-- til Livja, skabt kl. 09:06 dansk da hun godkendte en rapport. Den lå ikke
-- fast. Den ventede MED VILJE: send-notification-email lader tre typer vente
-- 240 minutter (_shared/notificationEmailSelection.ts, EMAIL_DELAY_MINUTES_BY_TYPE,
-- besluttet 10/8: «handlingsudløste typer venter, så et medlem der netop
-- selv har uploadet, ikke får en mail om noget de allerede ved»), og sender
-- alt «deferred» kun kl. 07–20 dansk. Vagtens trin 4 råbte efter 30 minutter
-- — for ALLE typer og HELE døgnet. Den ville sige «køen står stille» om
-- noget der opførte sig præcis som designet, i op til 3½ time, og om alt
-- over 15 minutter om natten.
--
-- MOTORENS REGLER, ordret (notificationEmailSelection.ts):
--   DEFAULT_EMAIL_DELAY_MINUTES = 15
--   EMAIL_DELAY_MINUTES_BY_TYPE = { report_review_ready: 240, report_error: 240,
--                                   alert_financial_summary: 240 }
--   SEND_WINDOW 07 (inkl.) – 20 (ekskl.) Europe/Copenhagen, for alt der er
--   «deferred»: egen ventetid ELLER ældre end 6 timer. Friske default-typer
--   sendes døgnet rundt.
--
-- AFGJORT (punkt 2) — vejen (b), i den form der KAN bygges: vagten kender
-- INGEN typer. Den dømmer på ÉT tal: motorens LÆNGSTE ventetid (240 min) plus
-- en margin (30 min). En række der er ældre end det og stadig usendt, er
-- forfalden uanset hvilken type den er — det er den eneste dom der ikke
-- kræver typelisten. Hvorfor ikke dele tallene: SQL kan ikke importere
-- TypeScript, og TypeScript læser ikke SQL; den ENESTE fælles kilde ville
-- være en tabel (app_config), som motoren så skulle læse ved hver kørsel —
-- en omlægning af motoren, ikke af vagten. Næstbedst er derfor ét loft her,
-- mærket som motorens, ikke en typeliste. Ændres 240 i motoren, skal
-- v_motor_laengste_ventetid_min følge med — det står ved konstanten, og et
-- paritetsværn i vitest (læs denne fil, sammenlign med max af
-- EMAIL_DELAY_MINUTES_BY_TYPE) er det rigtige næste skridt; det hører i src
-- og er ikke med her.
--   Jonas' udgangspunkt — «INGEN mails er sendt i for lang tid» — er den
-- rigtige alarm, men den kan ikke stå alene: står alle ventende rækker i
-- deres egen 240-minutters ventetid, sender motoren legitimt intet i timer.
-- Derfor tælles «hvornår rørte motoren sidst noget» (email_sent_at og
-- notification-%-rækker i email_send_log) med i tallene som forklaring —
-- men dommen falder på de forfaldne.
--
-- VINDUET (punkt 3): uden for 07–20 dansk råber vagten IKKE om ventende
-- mails. Og de første 30 minutter efter kl. 07 heller ikke — en række
-- skabt kl. 18 med 240 min ventetid er «forfalden» kl. 22 og venter
-- legitimt til den første kørsel efter kl. 07; motoren skal have sit
-- kvarter. Tallene skrives stadig hele døgnet (usendte, forfaldne,
-- i_vindue), så loggen kan læses bagud; kun DOMMEN er gated.
--
-- HVAD ÆNDRES mod 20260910140000: KUN trin 4 (mailkøen), de tilhørende
-- konstanter, dommen for koe_staar_stille, og tal-nøglerne (de to gamle,
-- usendte_30m og aeldste_usendt_min, bevares fordi forsidens linje
-- (src/lib/cronVagt.ts grundTekst) læser dem — de betyder nu «venter ud over
-- motorens korteste ventetid (15 min)»; nye: usendte_taerskel_min, forfaldne,
-- aeldste_forfalden_min, forfaldne_taerskel_min, i_vindue,
-- motor_sidst_roert_min). Alt andet ordret som femte version.
--
-- DE SEKS: 20260909234500 alias-kollision · 20260910100000 timeout uden
-- indeks · 20260910120000 array-konkatenering · 20260910130000 NOT NULL læst
-- forkert · 20260910140000 notifikationen · 20260910150000 (denne) tærsklen.
--
-- DEPLOY: køres MANUELT i Lovable → SQL editor. Bagefter, MED DET SAMME:
--   SELECT * FROM public.vagt_cron();
--   -- tal->'forfaldne' = 0 og dom uden 'koe_staar_stille', mens Livjas række
--   -- stadig står i tal->'usendte_30m' indtil ca. 13:06 dansk.
--   SELECT tid, dom, grunde, tal->'usendte_30m', tal->'forfaldne', tal->'i_vindue', tal->'motor_sidst_roert_min'
--   FROM public.cron_vagt_log ORDER BY tid DESC LIMIT 3;
--   -- Og motorens egen bekræftelse kl. 13:15 dansk:
--   SELECT created_at, status FROM public.email_send_log
--   WHERE template_name = 'notification-alert_financial_summary' AND created_at > now() - interval '3 hours';

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
  v_vagt_selv_fejlet integer;
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
    SELECT d.runid, d.jobid, d.status, d.start_time, d.command
    FROM cron.job_run_details d
    ORDER BY d.runid DESC
    LIMIT v_koersler_loft
  ),
  koersler AS (
    SELECT s.runid, s.jobid, s.status, s.start_time, s.command
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
         -- Vagtens egne kørsler kendes på KOMMANDOEN, ikke kun på jobid: et
         -- unschedule + schedule (som 20260909234500 gør) giver et nyt jobid,
         -- og de gamle fejlede rækker beholder det gamle (10/9: to «fremmede»
         -- fejl var vagten selv under sit forrige jobid).
         (SELECT count(*) FROM koersler WHERE start_time > now() - interval '60 minutes' AND status = 'failed'
            AND jobid IS DISTINCT FROM v_vagt_jobid AND command NOT ILIKE '%vagt_cron%'),
         (SELECT count(*) FROM koersler WHERE start_time > now() - interval '60 minutes' AND status = 'failed'
            AND (jobid = v_vagt_jobid OR command ILIKE '%vagt_cron%')),
         (SELECT COALESCE(count(*) = v_koersler_loft AND min(start_time) > now() - interval '62 minutes', false) FROM seneste)
  INTO v_kald, v_ikke_200, v_jobs_ikke_200, v_ikke_200_uden_job, v_timeouts, v_koder,
       v_koersler, v_koersler_fejlet, v_vagt_selv_fejlet, v_koersler_loft_ramt
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
    v_tekster := array_append(v_tekster, format('%s cron-jobs svarede ikke 200 den seneste time (%s)', v_jobs_ikke_200, v_koder::text));
  END IF;
  IF v_koersler_fejlet >= 1 THEN
    v_grunde := array_append(v_grunde, 'cron_koersel_fejlet'::text);
    v_tekster := array_append(v_tekster, format('%s cron-kørsler fejlede i databasen den seneste time — ikke vagten selv', v_koersler_fejlet));
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
  'Cron-vagten (9/9; sjette version 10/9: mailkøen dømmes med MOTORENS regler — forfalden = ældre end motorens længste ventetid (240 min) + 30, kun i vinduet 07–20 dansk og tidligst 07:30; typerne kendes ikke). Ren SQL uden HTTP og uden vault-nøglen. Læser cron.job_run_details KUN gennem primærnøglen (seneste 2000). Tæller vault.secrets, net._http_response (60 min, én join), fejlede cron-kørsler (uden vagtens egne) og mailkøen; skriver én række i cron_vagt_log og ved rød én advisor_notification (company_id NULL) pr. rådgiver pr. døgn, i egen EXCEPTION-blok.';
