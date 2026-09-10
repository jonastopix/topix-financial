-- Migration: vagtens notifikation — FEMTE version på to dage.
--
-- MÅLT I PROD 10/9 kl. 11:16, efter at array-rettelsen (20260910130000) er
-- kørt og dommen nås:
--   ERROR: 23502: null value in column "company_id" of relation
--   "advisor_notifications" violates not-null constraint
--
-- FEJL NUMMER FEM VAR EN KOLONNE DER BLEV LÆST I HISTORIKKEN FREM FOR MÅLT I
-- PROD. Reconen 9/9 skrev «company_id nullable, udelades». Kolonnen er
-- NOT NULL fra tabellens oprettelse (20260226070216:8):
--   company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL
-- — NOT NULL står SIDST på linjen, efter FK-klausulen, og blev overset i
-- læsningen. Ét `SELECT is_nullable FROM information_schema.columns` havde
-- afgjort det på fem sekunder. Og fordi INSERT'en fejlede inde i samme
-- transaktion som loggen, rullede logrækken med: vagten nåede dommen og
-- efterlod alligevel ingenting.
--
-- DE FEM: 20260909234500 alias-kollision · 20260910100000 timeout uden
-- indeks · 20260910120000 array-konkatenering · 20260910130000 NOT NULL
-- læst forkert · 20260910140000 (denne). Ingen af dem fundet af en test —
-- ingen test kører plpgsql — og ingen af dem fundet af den SELECT der står
-- nederst i hvert filhoved. Den skal køres. Hver gang.
--
-- AFGJORT (punkt 1): company_id gøres NULLABLE. En driftsbesked handler ikke
-- om en virksomhed; at hænge den på Topix.dk (er_kunde = false) eller på en
-- nul-uuid ville være en løgn i data — og med ON DELETE CASCADE ville
-- driftsbeskederne forsvinde den dag den virksomhed slettes.
-- Målt før beslutningen — hvem skriver ellers i tabellen, og har de altid et
-- company_id:
--   send-slack-report-notification   report.company_id            altid
--   send-slack-handout-notification  handout.company_id           altid
--   send-slack-chat-notification     conversation.company_id      altid
--   run-company-agent                args.company_id              altid
--   send-slack-feedback-notification feedback.company_id ELLER
--                                    '00000000-0000-0000-0000-000000000000'
--                                    — en pladsholder der ikke findes i
--                                    companies (FK!) og derfor fejler stille
--                                    når feedback er uden virksomhed. Den
--                                    ville have brugt NULL, hvis kolonnen
--                                    havde tilladt det. Rettes ikke her.
--   Frontend (src/lib/*Notify.ts) skriver i notifications, ikke her.
--   Læserne: AdvisorNotifications.tsx navigerer på member_id/reference_id,
--   aldrig på company_id; ingen policy og ingen SQL-funktion læser kolonnen;
--   hardDeleteCompany og slettefunktionen sletter på company_id = <id>, som
--   aldrig rammer NULL. Nullable er derfor sikker for alle der findes.
--   member_id (NOT NULL, «who triggered it») sættes fortsat til rådgiveren
--   selv — også en halv sandhed, men det er en anden kolonne og en anden
--   beslutning; den står her så den ikke er glemt.
--
-- OG DOMMEN VAR RØD (punkt 2): «2 cron-kørsler fejlede i databasen den
-- seneste time» — filtret på vagtens EGNE fejl holdt ikke. Mest sandsynlig
-- grund: filtret så kun på det NUVÆRENDE jobid; et unschedule + schedule
-- (som 20260909234500 gør hver gang den køres) giver et nyt jobid, og de
-- gamle fejlede rækker beholder det gamle. Derfor kendes vagtens egne
-- kørsler nu OGSÅ på kommandoteksten (command ILIKE '%vagt_cron%'). SELECT'en
-- der afgør hvad de to var, står nederst.
--
-- ÆNDRINGER mod 20260910130000: (1) ALTER TABLE advisor_notifications ALTER
-- COLUMN company_id DROP NOT NULL; (2) INSERT'en sætter company_id = NULL
-- eksplicit; (3) notifikationsblokken har egen EXCEPTION, så budbringeren
-- aldrig ruller dommen tilbage — fejlen skrives i rækkens tal som
-- notifikation_fejl; (4) egne kørsler kendes på command, ikke kun jobid.
-- Alt andet ordret som før.
--
-- DEPLOY: køres MANUELT i Lovable → SQL editor. Bagefter, MED DET SAMME:
--   SELECT is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'advisor_notifications' AND column_name = 'company_id';  -- YES
--   SELECT * FROM public.vagt_cron();   -- én række; tal->'vagt_selv_fejlet_60m' bærer formiddagens fejl, koersler_fejlet_60m = 0
--   SELECT tid, dom, grunde, tal->'notifikation_fejl' FROM public.cron_vagt_log ORDER BY tid DESC LIMIT 3;
--
-- PUNKT 2 — hvilke jobs fejlede den seneste time, og hvad sagde de (gennem
-- primærnøglen, ikke start_time):
--   SELECT d.runid, d.jobid, j.jobname, d.status, d.start_time, left(d.command, 60) AS command, d.return_message
--   FROM (SELECT * FROM cron.job_run_details ORDER BY runid DESC LIMIT 2000) d
--   LEFT JOIN cron.job j ON j.jobid = d.jobid
--   WHERE d.start_time > now() - interval '60 minutes' AND d.status = 'failed'
--   ORDER BY d.start_time DESC;
--   -- jobname NULL + command 'SELECT public.vagt_cron();' = vagten selv under et gammelt jobid.
--   -- Et andet jobname = en RIGTIG driftsfejl; return_message siger hvilken.

-- ── 1) Kolonnen ──

ALTER TABLE public.advisor_notifications
  ALTER COLUMN company_id DROP NOT NULL;

COMMENT ON COLUMN public.advisor_notifications.company_id IS
  'Virksomheden beskeden handler om. NULL for driftsbeskeder (type = drift, cron-vagten, 10/9) — de handler ikke om en virksomhed.';

-- ── 2) Funktionen ──

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

  -- 6. Ved RØD: én besked pr. rådgiver pr. årsag pr. døgn. company_id er
  --    NULL — en driftsbesked handler ikke om en virksomhed (kolonnen gjort
  --    nullable i denne migration). Blokken har sin egen EXCEPTION: fejler
  --    budbringeren, må dommen og loggen ALDRIG rulles tilbage med den
  --    (10/9 kl. 11:16: NOT NULL-fejlen tog logrækken med i faldet). Fejlen
  --    skrives i stedet ind i rækkens tal som notifikation_fejl.
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
  'Cron-vagten (9/9; femte version 10/9). Ren SQL uden HTTP og uden vault-nøglen. Læser cron.job_run_details KUN gennem primærnøglen (seneste 2000). Tæller vault.secrets, net._http_response (60 min, én join), fejlede cron-kørsler (uden vagtens egne — kendt på jobid OG command) og mailkøen; skriver én række i cron_vagt_log og ved rød én advisor_notification (company_id NULL) pr. rådgiver pr. døgn, i egen EXCEPTION-blok.';
