-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- DRIFTSAGENTENS LÆSERET (30/9-2026) — KØRES KUN, hvis FØR-SQL'ens sektion 4 i
-- 20260930150000_driftsagent.sql viste false på en af linjerne «USAGE schema
-- cron», «SELECT cron.job», «SELECT cron.job_run_details», «USAGE schema net»
-- eller «SELECT net._http_response». Viste alle true: kør den IKKE, og skriv
-- «ikke nødvendig — FØR viste true» øverst i stedet for «IKKE KØRT».
--
-- HVORFOR: public.drift_agent_laes() er SECURITY INVOKER (ingen ny SECURITY
-- DEFINER) og læser derfor som service_role. Ingen migration i repoet har givet
-- service_role adgang til cron eller net (grep 30/9) — umålt i prod.
--
-- KUN GRANT, kun SELECT/USAGE, kun til service_role. Intet andet ændres. Rollen
-- har i forvejen fuld adgang til alle husets tabeller; kommandoerne i cron.job
-- bærer ingen hemmelighed i klartekst (kald_edge henter nøglen i vault), så
-- læseretten åbner intet, service_role ikke allerede har.
--
-- STOP-REGEL: fejler en GRANT med «permission denied» eller «must be owner»,
-- har postgres ikke grant-retten på pg_cron/pg_net i Lovable Cloud. Så STOP —
-- kør intet mere, og skriv fejlteksten ordret her. Agenten svarer i mellemtiden
-- med et rødt fund («kan ikke læse cron.job …»), så intet er stille.
--
-- RLS PÅ cron.job: pg_cron har en politik (username = current_user). service_role
-- ser kun ALLE jobs, hvis rollen har BYPASSRLS (FØR-SQL sektion 4, første linje).
-- Er den false, ser agenten 0 jobs og melder «ser 0 cron-jobs» — rød. Det løses
-- IKKE her (en ny politik på pg_crons tabel er et andet skridt og kræver grønt lys).
--
-- EFTER-SQL: FØR-SQL'ens sektion 4 igen — alle linjer true.
-- ROLLBACK:
--   revoke select on cron.job, cron.job_run_details from service_role;
--   revoke usage on schema cron from service_role;
--   revoke select on net._http_response from service_role;
--   revoke usage on schema net from service_role;

grant usage on schema cron to service_role;
grant select on cron.job to service_role;
grant select on cron.job_run_details to service_role;

grant usage on schema net to service_role;
grant select on net._http_response to service_role;

-- EFTER-tjek:
select x.hvad, x.svar::text from (values
  ('service_role rolbypassrls',   (select rolbypassrls from pg_roles where rolname = 'service_role')),
  ('USAGE schema cron',           has_schema_privilege('service_role', 'cron', 'USAGE')),
  ('SELECT cron.job',             has_table_privilege('service_role', 'cron.job', 'SELECT')),
  ('SELECT cron.job_run_details', has_table_privilege('service_role', 'cron.job_run_details', 'SELECT')),
  ('USAGE schema net',            has_schema_privilege('service_role', 'net', 'USAGE')),
  ('SELECT net._http_response',   has_table_privilege('service_role', 'net._http_response', 'SELECT'))
) x(hvad, svar)
order by 1;
