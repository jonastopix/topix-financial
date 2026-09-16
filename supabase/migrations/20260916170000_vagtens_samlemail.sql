-- Migration: vagtens samlemail-regel — NIENDE version.
--
-- FEJLEN — MÅLT I PROD 16/9 kl. 15:07 (recon-mailkoe-alarmer §4): forsiden
-- sagde «29 mails venter i køen, den ældste i 300 min» og vagten var RØD
-- (koe_staar_stille fra ca. 14:36). 25 af de 29 var community_opslag skabt
-- kl. 10:06 — samlemail-rækker, som motoren med vilje ikke rører før kl. 17
-- dansk (samlemail.ts SAMLEMAIL_TYPER/SAMLEMAIL_TIME_DANSK; send-notification-
-- email :243 udelukker dem af køen og :261 henter dem kun i vinduet 17–20).
-- Vagten (ottende version) kendte ikke samlemailen: den dømte «forfalden»
-- efter motorens længste ventetid 240 + 30 min, uanset type, og 301 min >
-- 270 gav rød — for rækker der ventede legitimt.
--
-- JONAS' GRØNNE LYS 16/9 (ordret, efter chattens forklaring og anbefaling A):
--   «Forstår det ikke helt. Hvis du mener A er den bedste løsning for os, så
--   går vi med den.»
-- A (ordret fra plan-vagt-samlemail.md §6): vagt_cron() (SECURITY DEFINER,
--   CLAUDE.md:99) ændres i en niende version, så event_published og
--   community_opslag først tæller som forfaldne 30 minutter efter det
--   samlemail-vindue (kl. 17 dansk) de var klar til, og vises særskilt som
--   «N venter på samlemailen kl. 17» — alt andet i vagten uændret.
--
-- REGLEN (niende version):
--   * De to typer holdes ude af usendte_30m/aeldste_usendt_min og af den
--     almindelige forfalden-regel (240 + 30 min).
--   * Seneste samlemail-vindue = dagens kl. 17 dansk hvis det har været åbent
--     i mindst 30 min (v_margin_min), ellers gårsdagens kl. 17.
--   * En samlemail-række er FORFALDEN når created_at < seneste vindue − 15
--     min (v_motor_korteste_ventetid_min): den var klar da vinduet åbnede, og
--     står her stadig. Ellers VENTER den (til næste kl. 17).
--   * Forfaldne samlemail-rækker lægges til v_forfaldne og dømmes som alle
--     andre (koe_staar_stille, samme tærskel som før). Teksten nævner dem.
--   * tal får: samlemail_venter, samlemail_forfaldne,
--     samlemail_aeldste_venter_min, samlemail_seneste_vindue_start,
--     samlemail_time, samlemail_typer. Forsidens linje (src/lib/cronVagt.ts)
--     læser samlemail_venter («…, 25 venter på samlemailen kl. 17») og
--     samlemail_forfaldne («25 mails fra samlemailen skulle være gået kl.
--     17» — ellers stod der «0 mails venter i køen» når kun samlemailen
--     fejler, fordi usendte_30m ikke tæller dem).
--   IKKE ændret: dommen i øvrigt, koe_pauset (usendte_30m uden samlemail-
--   rækker — kun samlemail-rækker + pauset job giver ingen gul; noteret),
--   hoved, grants. Rådgivernes rækker udelukkes ikke (eget spørgsmål).
--
-- ALT ANDET ORDRET SOM 20260910170000 (ottende version): de nye linjer og
-- blokke er mærket «-- NIENDE» (enkeltlinje) og «-- NIENDE >>>» …
-- «-- <<< NIENDE» (blok). Fjernes mærkerne, er kroppen tegn for tegn ottende
-- versions — det er kildeværnets metode (vagtSamlemail.guard.test.ts), og
-- værnet kræver også samme typeliste og klokkeslæt som samlemail.ts,
-- SECURITY DEFINER, search_path = public og de tre REVOKE-linjer.
--
-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge.
--
-- FØR-SQL (ét resultatsæt — køres FØR migrationen; md5 måles før kørsel):
--   select '0 prod-krop' as sektion, 'pg_get_functiondef' as noegle,
--          pg_get_functiondef('public.vagt_cron()'::regprocedure) as vaerdi
--   union all
--   select '1 definition', 'md5(pg_get_functiondef)',
--          md5(pg_get_functiondef('public.vagt_cron()'::regprocedure))
--   union all
--   select '1 definition', 'nævner samlemail',
--          (pg_get_functiondef('public.vagt_cron()'::regprocedure) ilike '%samlemail%')::text
--   union all
--   select '1 definition', 'SECURITY DEFINER / search_path',
--          concat(p.prosecdef, ' / ', array_to_string(p.proconfig, ' '))
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'vagt_cron'
--   union all
--   select '2 grants', coalesce(r.grantee, '(ingen)'), coalesce(r.privilege_type, '')
--     from information_schema.routine_privileges r
--    where r.specific_schema = 'public' and r.routine_name = 'vagt_cron'
--   union all
--   select '2 grants', 'proacl', coalesce(p.proacl::text, 'NULL (= ejer alene)')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'vagt_cron'
--   union all
--   select '3 cron.job', j.jobname,
--          concat('jobid=', j.jobid, ' schedule=', j.schedule, ' active=', j.active, ' command=', left(j.command, 60))
--     from cron.job j where j.command ilike '%vagt_cron%'
--   union all
--   select '4 seneste dom', s.dom, s.rest
--     from (select l.dom, concat(to_char(l.tid at time zone 'Europe/Copenhagen', 'HH24:MI'), ' | ',
--                                array_to_string(l.grunde, ','), ' | ', l.tal::text) as rest
--             from public.cron_vagt_log l order by l.tid desc limit 1) s
--   union all
--   select '5 koeen nu', n.type, count(*)::text
--     from public.notifications n
--    where n.email_sent_at is null and n.seen_at is null
--      and n.priority in ('action_required','important') and n.type <> 'report_reminder'
--    group by n.type
--   union all
--   select '5 koeen nu', 'rådgiverrækker blandt dem', count(*)::text
--     from public.notifications n
--    where n.email_sent_at is null and n.seen_at is null
--      and n.priority in ('action_required','important') and n.type <> 'report_reminder'
--      and n.user_id in (select ur.user_id from public.user_roles ur where ur.role in ('advisor','admin'))
--   union all
--   select '6 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FØR-md5: måles før kørsel (indsættes her).
--
-- EFTER-SQL (samme sæt + ét kald af vagten — kaldet skriver én række i
-- cron_vagt_log og ved rød én klokkebesked pr. rådgiver; læs FØR's sektion 5
-- først):
--   … FØR-SQL'ens sektioner 1–6 …
--   union all
--   select 'A koersel', 'vagt_cron()',
--          (select concat(dom, ' | ', array_to_string(grunde, ','), ' | ', tal::text) from public.vagt_cron())
--   FACIT: md5 ændret; «nævner samlemail» = true; prosecdef true og
--   proconfig {search_path=public}; ingen rækker i routine_privileges og
--   proacl som FØR; cron.job uændret (7 * * * *, active); dommen groen med
--   tal->>'samlemail_venter' = antallet af event_published/community_opslag
--   skabt efter seneste vindue − 15 min, og tal->>'forfaldne' = 0 (medmindre
--   der er rigtigt forfaldne rækker — så nævner teksten dem).

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
  -- NIENDE >>>
  -- SAMLEMAILEN (niende version, 16/9): event_published og community_opslag
  -- tages IKKE af køen — de samles i vinduet 17–20 dansk (samlemail.ts
  -- SAMLEMAIL_TYPER, SAMLEMAIL_TIME_DANSK, erISamlemailVindue; send-
  -- notification-email :243 udelukker dem, :261 henter dem kun i vinduet).
  -- Uden for vinduet rører motoren dem ikke: en række venter legitimt til
  -- næste kl. 17. FORFALDEN er den først når det seneste vindue der har været
  -- åbent i mindst v_margin_min, åbnede EFTER at rækken var klar (15 min
  -- gammel). Målt 16/9 15:07: 25 opslag fra 10:06 gjorde vagten rød kl. 14:36
  -- — de ventede legitimt.
  -- ÆNDRES LISTEN ELLER KLOKKEN I samlemail.ts, SKAL DETTE FØLGE
  -- (kildeværn: src/lib/__tests__/vagtSamlemail.guard.test.ts læser begge).
  v_samlemail_typer constant text[] := ARRAY['event_published', 'community_opslag'];
  v_samlemail_time constant integer := 17;
  v_samlemail_seneste_start timestamptz;
  v_samlemail_venter integer;
  v_samlemail_forfaldne integer;
  v_samlemail_aeldste_venter_min integer;
  v_samlemail_aeldste_forfalden_min integer;
  -- <<< NIENDE
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
  -- NIENDE >>>
  --    4a2. Samlemailens seneste vindue: dagens kl. 17 dansk hvis det har
  --         været åbent i mindst v_margin_min, ellers gårsdagens. Lokal tid
  --         → timestamptz med AT TIME ZONE (v_lokal er timestamp uden zone).
  v_samlemail_seneste_start :=
    (CASE WHEN v_lokal >= date_trunc('day', v_lokal) + make_interval(hours => v_samlemail_time, mins => v_margin_min)
          THEN date_trunc('day', v_lokal) + make_interval(hours => v_samlemail_time)
          ELSE date_trunc('day', v_lokal) - interval '1 day' + make_interval(hours => v_samlemail_time)
     END) AT TIME ZONE 'Europe/Copenhagen';
  -- <<< NIENDE

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
    AND NOT (n.type = ANY (v_samlemail_typer)) -- NIENDE
    AND n.type <> 'report_reminder';
  -- NIENDE >>>
  --    4c2. Samlemailens rækker for sig, samme filter: «venter» (skabt efter
  --         seneste vindue åbnede − 15 min — de går næste kl. 17) og
  --         «forfaldne» (var klar da vinduet åbnede, og er her stadig).
  --         Forfaldne samlemail-rækker tæller med i dommen som alle andre.
  SELECT count(*) FILTER (WHERE n.created_at >= v_samlemail_seneste_start - make_interval(mins => v_motor_korteste_ventetid_min)),
         count(*) FILTER (WHERE n.created_at < v_samlemail_seneste_start - make_interval(mins => v_motor_korteste_ventetid_min)),
         COALESCE(floor(extract(epoch FROM (now() - min(n.created_at) FILTER (WHERE n.created_at >= v_samlemail_seneste_start - make_interval(mins => v_motor_korteste_ventetid_min)))) / 60)::integer, 0),
         COALESCE(floor(extract(epoch FROM (now() - min(n.created_at) FILTER (WHERE n.created_at < v_samlemail_seneste_start - make_interval(mins => v_motor_korteste_ventetid_min)))) / 60)::integer, 0)
  INTO v_samlemail_venter, v_samlemail_forfaldne, v_samlemail_aeldste_venter_min, v_samlemail_aeldste_forfalden_min
  FROM public.notifications n
  WHERE n.email_sent_at IS NULL
    AND n.seen_at IS NULL
    AND n.priority IN ('action_required', 'important')
    AND n.type = ANY (v_samlemail_typer);
  v_forfaldne := v_forfaldne + v_samlemail_forfaldne;
  v_aeldste_forfalden_min := greatest(v_aeldste_forfalden_min, v_samlemail_aeldste_forfalden_min);
  -- <<< NIENDE

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
    -- NIENDE >>>
    IF v_samlemail_forfaldne > 0 THEN
      v_tekster := array_append(v_tekster, format('%s af dem er samlemail-rækker der skulle være gået i vinduet kl. %s', v_samlemail_forfaldne, v_samlemail_time));
    END IF;
    -- <<< NIENDE
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
    'samlemail_venter', v_samlemail_venter, -- NIENDE
    'samlemail_forfaldne', v_samlemail_forfaldne, -- NIENDE
    'samlemail_aeldste_venter_min', v_samlemail_aeldste_venter_min, -- NIENDE
    'samlemail_seneste_vindue_start', v_samlemail_seneste_start, -- NIENDE
    'samlemail_time', v_samlemail_time, -- NIENDE
    'samlemail_typer', to_jsonb(v_samlemail_typer), -- NIENDE
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
  'Cron-vagten (9/9; niende version 16/9: samlemailens typer — event_published, community_opslag — tæller først som forfaldne når det seneste samlemail-vindue (kl. 17 dansk, åbent ≥ 30 min) åbnede efter at rækken var klar; de ventende står i tal.samlemail_venter. Ottende version 10/9: timeouts tælles på timed_out ELLER error_msg ~* timeout; error_msg dømmes før alderen; koder kender timeout og transportfejl). Ren SQL uden HTTP og uden vault-nøglen. Læser cron.job_run_details KUN gennem primærnøglen (seneste 2000). Tæller vault.secrets, net._http_response (60 min, én join), fejlede cron-kørsler (SQL-fejl rød, startup-fejl gul ved ≥ 3, vagtens egne holdt ude) og mailkøen (motorens 240 + 30 min, 07–20; samlemailen efter sit eget vindue); skriver én række i cron_vagt_log og ved rød én advisor_notification (company_id NULL) pr. rådgiver pr. døgn, i egen EXCEPTION-blok.';
