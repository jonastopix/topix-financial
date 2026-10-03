-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (REVOKE EXECUTE fra anon, trin 1a — g03-security-definer-anon).
--
-- Første linje er med vilje IKKE «-- IKKE KØRT. DEPLOY: …»: den, der scanner mappen efter
-- migrationer at køre, skal ikke tage denne med (samme form som 20261002280000_milestones_with_check).
-- CLAUDE.md «FORBIDDEN uden eksplicit grønt lys»: grants på SECURITY DEFINER-funktioner.
-- Ingen funktionskrop ændres, ingen politik, ingen trigger. Kun REVOKE/GRANT EXECUTE.
-- Værn: src/lib/__tests__/revokeAnon.guard.test.ts (dom 1–3).
--
-- MÅLT I PROD 3/10-2026 (Lovable-MCP, SELECT, som postgres):
--   69 SECURITY DEFINER-funktioner i public; 29 kan kaldes af anon; 18 af dem er ikke triggere.
--   Alle 29 ejes af postgres. ACL'en på 16 af de 18 er «=X/postgres … anon=X/postgres …» —
--   anon har BÅDE PUBLIC-grantet OG et eksplicit grant (pg_default_acl for postgres giver
--   anon/authenticated/service_role EXECUTE på hver ny funktion). Derfor REVOKE fra PUBLIC OG anon;
--   authenticated og service_role beholder deres EKSPLICITTE grants (gentaget nedenfor, idempotent).
--   De 11 triggerfunktioner med anon-EXECUTE røres ikke (en triggerfunktion kan ikke kaldes direkte).
--
-- DE 18 FORDELT (klassificeret efter kalder — grep af src/ og supabase/functions/ på
-- origin/main e39a9a29, pg_policy over ALLE skemaer, pg_proc-kroppe, cron.job):
--   Trin 1a (DENNE FIL, 14): anon har BEVISLIGT ingen grund — ingen anonym flade kalder dem,
--     ingen politik kalder dem, kun SECURITY DEFINER-funktioner (der kører som ejer) kalder dem.
--   Trin 1b (20261003201000, 2): has_role, user_company_id — står i 63 PUBLIC-politikker.
--   Bliver hos anon (2): lookup_invite_company_info (/auth, Auth.tsx:125) og hent_betalingstilbud
--     (/betal, Betal.tsx:200) — begge har allerede INTET PUBLIC-grant, kun et eksplicit anon-grant.
--
-- RETTET I FORHOLD TIL docs/vaerdiliste.md §2 punkt 14 (målt, ikke antaget): is_legat_user står
-- dér i trin 1b, men den står i NUL politikker (pg_policy, alle skemaer og roller), kaldes af
-- INGEN funktion, intet i src/ og intet i supabase/functions/. Den hører derfor til 1a.
-- Trin 1a er også bredere end punkt 14's «de rent skrivende/markerende»: de tre læse-RPC'er
-- get_siden_sidst(_virksomheder) og get_conversation_sender_profiles samt get_users_last_login
-- er med, fordi kriteriet er «anon bruger dem bevisligt ikke» — hver har sin grund nedenfor.
--
-- PR FUNKTION (kalder i dag → hvorfor anon kan miste den):
--   cleanup_stale_processing_reports()   cron 554 som postgres (ejer — påvirkes ikke af REVOKE).
--                                        Ingen klient, ingen edge function. SKRIVER uden auth
--                                        (sætter processing > 10 min til error for ALLE). Derfor
--                                        også REVOKE fra authenticated — et medlem har ingen grund.
--   get_all_advisor_profiles()           9 klientsteder, alle bag login (ProgressView, AnsoegningView,
--                                        BoardroomView, useRaadgivere, svartid, trofaeer,
--                                        onlineMedlemmer, ubesvaredeOpslag, tjenestekonti). Ingen
--                                        auth i kroppen: giver i dag navn + avatar på alle rådgivere
--                                        til hvem som helst med anon-nøglen.
--   get_conversation_sender_profiles(uuid) MemberChatPane, CompanyChatPane, raadgiverSkrev — bag login.
--   get_siden_sidst(timestamptz)         hooks/sidenSidst.ts — rådgiverforsiden, bag login.
--   get_siden_sidst_virksomheder(timestamptz) samme.
--   get_users_last_login(uuid[])         VirksomhedslisteView, useVirksomhed — rådgiver, bag login.
--   is_legat_user(uuid)                  INGEN kalder (se ovenfor).
--   legat_day(uuid)                      kun legat_unlocked_modules (DEFINER → kører som ejer).
--   legat_unlocked_modules(uuid)         INGEN kalder.
--   log_user_login()                     useAuth.tsx:482 — efter login (authenticated). Skriver.
--   lookup_invite_company(uuid)          INGEN kalder (Auth.tsx bruger _info-udgaven).
--   mark_messages_read(uuid)             chatpanelerne — bag login. Skriver.
--   mark_notification_read(uuid)         useNotifications — bag login. Skriver.
--   mark_notifications_seen()            useNotifications — bag login. Skriver.
-- Edge functions: de anon-nøgle-klienter UDEN brugerens JWT (ai-financial-feedback, send-slack-*,
-- admin-cleanup-test-data, run-company-agent:999) bruger kun auth.getClaims — ingen RPC, ingen
-- tabel (run-company-agents callerClient bruges kun i grenen «ikke service role», hvor den bærer
-- brugerens JWT). send-invitation-email kalder user_company_id med SERVICE ROLE. Alle anonyme
-- flader (/ansoeg, /aftale, /delt/webinar, /ring-mig-op, og /w/* på feat/webinarmotor-skive2)
-- går gennem edge functions med service role — de rammes ikke af en REVOKE fra anon.
--
-- RÆKKEFØLGEN (ét skridt ad gangen):
--   1. Jonas' grønne lys.
--   2. FØR-SQL (gem CSV — de 14 skal stå med anon_x = true; acl'en er tilbagerulningens værdi).
--   3. TØRKØRSEL (DO-blok nedenfor): svarer ALTID med en fejl «TØRKØRSEL …» og ruller tilbage.
--      Den skal sige «OK 14/14». Siger den andet: STOP.
--   4. KØR denne fil i Lovable → SQL editor.
--   5. EFTER-SQL (gem CSV).
--   6. Røgprøven som anonym (docs/OVERLEVERING.md DEL 3 «Sikkerhed trin 1a/1b»): REST-kaldene med
--      anon-nøglen + livetjek i privat vindue af /auth, /betal, /ansoeg, /aftale, /delt/webinar,
--      /ring-mig-op — samme svar som før. Som medlem: chatten (læst-markering), klokken, login.
--      Som rådgiver: forsiden («Siden sidst»), virksomhedslisten (sidste login), /ansoegninger.
--   7. Flip første linje til «-- KØRT i prod …», ajourfør SECURITY_BASELINE §1 og kortet.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select p.oid::regprocedure::text as funktion,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
--          has_function_privilege('service_role', p.oid, 'EXECUTE') as sr_x,
--          coalesce(array_to_string(p.proacl, ' '), '(null)') as acl
--     from pg_proc p
--    where p.oid in (
--      'public.cleanup_stale_processing_reports()'::regprocedure,
--      'public.get_all_advisor_profiles()'::regprocedure,
--      'public.get_conversation_sender_profiles(uuid)'::regprocedure,
--      'public.get_siden_sidst(timestamptz)'::regprocedure,
--      'public.get_siden_sidst_virksomheder(timestamptz)'::regprocedure,
--      'public.get_users_last_login(uuid[])'::regprocedure,
--      'public.is_legat_user(uuid)'::regprocedure,
--      'public.legat_day(uuid)'::regprocedure,
--      'public.legat_unlocked_modules(uuid)'::regprocedure,
--      'public.log_user_login()'::regprocedure,
--      'public.lookup_invite_company(uuid)'::regprocedure,
--      'public.mark_messages_read(uuid)'::regprocedure,
--      'public.mark_notification_read(uuid)'::regprocedure,
--      'public.mark_notifications_seen()'::regprocedure)
--   order by 1;
--   Forventet (målt 3/10): 14 rækker, anon_x/auth_x/sr_x = true alle; acl
--   «=X/postgres postgres=X/postgres anon=X/postgres authenticated=X/postgres service_role=X/postgres
--   sandbox_exec_loiavmastgeieqyiwyyr=X/postgres» på alle 14.
--
-- TØRKØRSEL (Lovable → SQL editor; ændrer intet — slutter ALTID med RAISE EXCEPTION):
--   do $$
--   declare
--     fns regprocedure[] := array[
--       'public.cleanup_stale_processing_reports()','public.get_all_advisor_profiles()',
--       'public.get_conversation_sender_profiles(uuid)','public.get_siden_sidst(timestamptz)',
--       'public.get_siden_sidst_virksomheder(timestamptz)','public.get_users_last_login(uuid[])',
--       'public.is_legat_user(uuid)','public.legat_day(uuid)','public.legat_unlocked_modules(uuid)',
--       'public.log_user_login()','public.lookup_invite_company(uuid)','public.mark_messages_read(uuid)',
--       'public.mark_notification_read(uuid)','public.mark_notifications_seen()']::regprocedure[];
--     f regprocedure; ok int := 0; rapport text := '';
--   begin
--     foreach f in array fns loop
--       execute format('revoke execute on function %s from public, anon', f);
--     end loop;
--     revoke execute on function public.cleanup_stale_processing_reports() from authenticated;
--     foreach f in array fns loop
--       if not has_function_privilege('anon', f, 'EXECUTE')
--          and has_function_privilege('service_role', f, 'EXECUTE')
--          and (has_function_privilege('authenticated', f, 'EXECUTE')
--               = (f <> 'public.cleanup_stale_processing_reports()'::regprocedure))
--       then ok := ok + 1; else rapport := rapport || ' AFVIGER:' || f::text; end if;
--     end loop;
--     -- De to, anon SKAL beholde, og de to i trin 1b, er urørte:
--     if not has_function_privilege('anon', 'public.lookup_invite_company_info(uuid)', 'EXECUTE') then rapport := rapport || ' lookup_invite_company_info MISTET'; end if;
--     if not has_function_privilege('anon', 'public.hent_betalingstilbud(uuid)', 'EXECUTE') then rapport := rapport || ' hent_betalingstilbud MISTET'; end if;
--     if not has_function_privilege('anon', 'public.has_role(uuid,app_role)', 'EXECUTE') then rapport := rapport || ' has_role RØRT'; end if;
--     raise exception 'TØRKØRSEL % %/14%', case when ok = 14 and rapport = '' then 'OK' else 'STOP' end, ok, rapport;
--   end $$;
--   Forventet: «ERROR: TØRKØRSEL OK 14/14».
--
-- EFTER-SQL (ét resultatsæt — gem CSV): samme som FØR-SQL, plus de fire «kontrolrækker»:
--   select p.oid::regprocedure::text as funktion,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
--          has_function_privilege('service_role', p.oid, 'EXECUTE') as sr_x,
--          coalesce(array_to_string(p.proacl, ' '), '(null)') as acl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
--   order by 2 desc, 1;
--   Forventet: anon_x = true på PRÆCIS 4 (has_role, user_company_id, hent_betalingstilbud,
--   lookup_invite_company_info); false på de 14 her; auth_x = false KUN på
--   cleanup_stale_processing_reports blandt de 14; sr_x = true på alle 14. Og:
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
--      and has_function_privilege('anon', p.oid, 'EXECUTE');   -- 18 → 4
--   select jobid, jobname from cron.job where jobid = 554;      -- står; næste kørsel: status «succeeded»
--   select status, start_time from cron.job_run_details where jobid = 554 order by start_time desc limit 1;
--
-- RUL TILBAGE (gendanner FØR-acl'en præcis — PUBLIC og anon havde begge EXECUTE):
--   GRANT EXECUTE ON FUNCTION public.cleanup_stale_processing_reports() TO PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.get_all_advisor_profiles() TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.get_conversation_sender_profiles(uuid) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.get_siden_sidst(timestamptz) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.get_siden_sidst_virksomheder(timestamptz) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.get_users_last_login(uuid[]) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.is_legat_user(uuid) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.legat_day(uuid) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.legat_unlocked_modules(uuid) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.log_user_login() TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.lookup_invite_company(uuid) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.mark_messages_read(uuid) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.mark_notifications_seen() TO PUBLIC, anon;
--
-- KENDT EFTERVIRKNING: pg_default_acl for postgres giver anon EXECUTE på HVER ny funktion, og en
-- DROP + CREATE af en af de 14 giver anon grantet tilbage (CREATE OR REPLACE bevarer acl'en).
-- Enhver migration, der genskaber en af dem, skal gentage REVOKE-linjen (husets mønster for de
-- nyere RPC'er: «REVOKE ALL FROM PUBLIC, anon» i samme fil).

-- 1. Skriver uden auth og bruges kun af cron (som ejeren postgres): ingen klientrolle beholder den.
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_processing_reports() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_stale_processing_reports() TO service_role;

-- 2. Navn + avatar på alle rådgivere uden auth i kroppen; 9 kaldere, alle bag login.
REVOKE EXECUTE ON FUNCTION public.get_all_advisor_profiles() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_all_advisor_profiles() TO authenticated, service_role;

-- 3. Chatpanelernes afsenderprofiler — bag login.
REVOKE EXECUTE ON FUNCTION public.get_conversation_sender_profiles(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_conversation_sender_profiles(uuid) TO authenticated, service_role;

-- 4–5. Rådgiverforsidens «Siden sidst» — bag login.
REVOKE EXECUTE ON FUNCTION public.get_siden_sidst(timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_siden_sidst(timestamptz) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_siden_sidst_virksomheder(timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_siden_sidst_virksomheder(timestamptz) TO authenticated, service_role;

-- 6. Sidste login pr. medlem — rådgiverens virksomhedsliste, bag login.
REVOKE EXECUTE ON FUNCTION public.get_users_last_login(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_users_last_login(uuid[]) TO authenticated, service_role;

-- 7–9. Legat-funktionerne: ingen politik, ingen klient, ingen edge function kalder dem
--      (legat_day kun fra legat_unlocked_modules, som er DEFINER og kører som ejer).
REVOKE EXECUTE ON FUNCTION public.is_legat_user(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_legat_user(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.legat_day(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.legat_day(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.legat_unlocked_modules(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.legat_unlocked_modules(uuid) TO authenticated, service_role;

-- 10. Skriver en login-række for auth.uid() — kaldes efter login.
REVOKE EXECUTE ON FUNCTION public.log_user_login() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_user_login() TO authenticated, service_role;

-- 11. Den gamle invitationsopslag uden kaldere (/auth bruger lookup_invite_company_info, som BLIVER).
REVOKE EXECUTE ON FUNCTION public.lookup_invite_company(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.lookup_invite_company(uuid) TO authenticated, service_role;

-- 12–14. Læst-/set-markeringer — skriver, bag login.
REVOKE EXECUTE ON FUNCTION public.mark_messages_read(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_messages_read(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_notifications_seen() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_notifications_seen() TO authenticated, service_role;
