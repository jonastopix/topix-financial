-- KØRT i prod 30/9-2026 ca. 17:52 via Lovable-MCP'en efter Jonas' grønne lys («Ja til begge», 16:57). FØR: prosecdef false · ejer postgres · search_path=public · EXECUTE laes: service_role true, authenticated false, anon false · service_role USAGE cron false · EXECUTE cron.schedule true · cron.unschedule true · SELECT cron.job true · SELECT net._http_response true. EFTER: prosecdef TRUE · ejer postgres · search_path=public, pg_temp · de øvrige linjer UÆNDREDE.
--
-- DRIFTSAGENTENS LÆSEVEJ (30/9-2026, rettet efter teknisk råd samme dag, fund 1).
--
-- FORBIDDEN-LISTEN (CLAUDE.md) omfatter SECURITY DEFINER-funktioner. Denne fil
-- gør public.drift_agent_laes() til en SECURITY DEFINER og må derfor KUN køres,
-- når Jonas har givet grønt lys til netop det. Skriv «grønt lys: <dato/tid>» her,
-- før den køres. Uden den læser agenten som service_role og svarer med et RØDT
-- fund («kan ikke læse cron.job …» / «ser 0 cron-jobs») — intet er stille.
--
-- HVAD DER VAR GALT I FØRSTE UDGAVE: den gav service_role
--   GRANT USAGE ON SCHEMA cron / SELECT på cron.job, cron.job_run_details
--   GRANT USAGE ON SCHEMA net  / SELECT på net._http_response
-- USAGE på skemaet cron er ikke en læseret: Postgres' standard for en ny funktion
-- er EXECUTE til PUBLIC, og om pg_cron eller Lovable Cloud har frataget det på
-- cron.schedule/cron.unschedule, er UMÅLT — derfor linjerne «EXECUTE
-- cron.schedule/unschedule» nedenfor. Står EXECUTE til PUBLIC, er skemaets USAGE
-- det eneste værn, og USAGE + EXECUTE = service_role kunne planlægge og fjerne jobs. Det er SKRIVERET
-- til hele husets drift, givet til en nøgle, der ligger i hver edge function.
--
-- HVAD DER GØRES I STEDET — vagtens vej: vagt_cron() (20260909234500) læser cron
-- som SECURITY DEFINER, ejet af postgres. Her gøres den ENE, eksisterende læser
-- (public.drift_agent_laes(), oprettet i 20260930150000) til det samme:
--   * SECURITY DEFINER — kører som ejeren (postgres), ikke som service_role.
--   * search_path = public, pg_temp — pg_temp SIDST, så et midlertidigt objekt
--     aldrig skygger for et af funktionens navne. Alle tabelnavne i kroppen er
--     skema-kvalificerede (cron.job, cron.job_run_details, net._http_response,
--     public.<spor>, public.cron_vagt_log, public.drift_agent_kerne).
--   * SELECT-only: STABLE; ingen INSERT/UPDATE/DELETE, ingen kald_edge, ingen
--     net.http_post, ingen cron.schedule (driftDom.guard dom 3 prøver kroppen).
--     Den dynamiske SQL (sporene) bygges af en KONSTANT værdiliste med %I/%L —
--     funktionen tager ingen parametre.
--   * Returnerer ALDRIG cron.job.command — kun navn, skema, active, mål og timeout
--     udledt af kommandoen; af et HTTP-svar kun kernefelterne (tal/sandhedsværdier).
--   * EXECUTE kun til service_role (gentaget her, så rettighederne står ét sted).
-- Ingen GRANT på cron eller net. Ingen ny rolle, ingen politik. Intet andet røres.
--
-- STOP-REGLER:
--   * FØR-SQL: «drift_agent_laes ejer» skal være postgres. Er den en anden, STOP —
--     en DEFINER kører med ejerens rettigheder, og dem har vi ikke målt.
--   * FØR-SQL: «drift_agent_laes prosecdef» skal være false (150000 oprettede den
--     som INVOKER). Er den true, er filen kørt — skriv det her, og kør intet.
--   * EFTER-SQL: linjerne «service_role USAGE schema cron», «EXECUTE
--     cron.schedule», «EXECUTE cron.unschedule», «SELECT cron.job» og «SELECT
--     net._http_response» skal stå PRÆCIS som i FØR. Ændrede én sig, er noget
--     andet sket — STOP, og skriv begge sæt her.
--
-- FØR-SQL og EFTER-SQL (samme forespørgsel, ét resultatsæt — gem CSV før og efter):
--   select x.hvad, x.svar from (values
--     ('drift_agent_laes prosecdef',  (select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'drift_agent_laes')),
--     ('drift_agent_laes ejer',       (select pg_get_userbyid(p.proowner)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'drift_agent_laes')),
--     ('drift_agent_laes proconfig',  (select coalesce(array_to_string(p.proconfig, ' '), '(ingen)') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'drift_agent_laes')),
--     ('EXECUTE laes: service_role',  has_function_privilege('service_role', 'public.drift_agent_laes()', 'EXECUTE')::text),
--     ('EXECUTE laes: authenticated', has_function_privilege('authenticated', 'public.drift_agent_laes()', 'EXECUTE')::text),
--     ('EXECUTE laes: anon',          has_function_privilege('anon', 'public.drift_agent_laes()', 'EXECUTE')::text),
--     ('service_role USAGE schema cron', has_schema_privilege('service_role', 'cron', 'USAGE')::text),
--     ('EXECUTE cron.schedule',       has_function_privilege('service_role', 'cron.schedule(text,text,text)', 'EXECUTE')::text),
--     ('EXECUTE cron.unschedule',     has_function_privilege('service_role', 'cron.unschedule(text)', 'EXECUTE')::text),
--     ('SELECT cron.job',             has_table_privilege('service_role', 'cron.job', 'SELECT')::text),
--     ('SELECT net._http_response',   has_table_privilege('service_role', 'net._http_response', 'SELECT')::text)
--   ) x(hvad, svar)
--   order by 1;
--   FACIT FØR:   prosecdef false · ejer postgres · proconfig search_path=public ·
--                laes: service_role true, authenticated false, anon false · de fem
--                cron/net-linjer = det, de er (skriv dem ind her).
--   FØR (indsættes her): [ikke målt endnu]
--   FACIT EFTER: prosecdef TRUE · ejer postgres · proconfig search_path=public, pg_temp ·
--                laes: service_role true, authenticated false, anon false · de fem
--                cron/net-linjer UÆNDREDE fra FØR.
--   EFTER (indsættes her): [ikke målt endnu]
-- BEVISET for læsevejen er IKKE denne SQL (den kører som postgres), men
-- tørkørslen gennem service_role (20260930150000 trin 4): «tal.jobs» > 0 og
-- «laesefejl» tom.
--
-- ROLLBACK (tilbage til INVOKER — agenten melder da rødt «kan ikke læse»):
--   alter function public.drift_agent_laes() security invoker;
--   alter function public.drift_agent_laes() set search_path = public;

alter function public.drift_agent_laes() security definer;
alter function public.drift_agent_laes() set search_path = public, pg_temp;

revoke all on function public.drift_agent_laes() from public, anon, authenticated;
grant execute on function public.drift_agent_laes() to service_role;

comment on function public.drift_agent_laes() is
  'Driftsagenten (30/9-2026, skive 1): agentens ENESTE læsning af cron.job, cron.job_run_details (seneste 3000 gennem runid, 25 t), net._http_response (25 t, kun kernen af 200-svar), sporenes udfald (time/døgn) og cron_vagt_log. SECURITY DEFINER (vagtens vej — ingen GRANT på cron/net til service_role; 20260930151000, grønt lys fra Jonas), search_path = public, pg_temp, STABLE, kun SELECT, returnerer aldrig cron.job.command; hver sektion i egen EXCEPTION-blok → «fejl». EXECUTE kun til service_role. Dommen bor i supabase/functions/_shared/driftDom.ts.';
