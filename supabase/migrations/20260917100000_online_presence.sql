-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (før Update-klik).
--
-- Online-medlemmer i realtid på rådgiverens forside (16/9-2026) — to
-- RLS-politikker på realtime.messages (Supabase Realtime Authorization for
-- Presence). Ingen tabel, ingen kolonne, ingen SECURITY DEFINER-ændring:
-- public.has_role KALDES her som i profiles/user_login_log-politikkerne
-- (20260223152943:45-47, 20260302213733:14-17), den ændres ikke.
--
-- JONAS 16/9 (ordret): «Ja» til chattens sætning: kun rådgivere må i realtid
-- se hvilke medlemmer der har appen åben, som profilbilleder med navn;
-- legatmodtagere og gæster vises også, legat med mærket «Legat».
--
-- HVORDAN (plan-online-realtime.md §1; recon-realtime-presence.md §2, Supabase
-- «Realtime Authorization»): «You can control client access to Realtime
-- Broadcast and Presence by adding Row Level Security policies to the
-- realtime.messages table … Control which clients can publish their presence
-- to a Channel · Control which clients can receive messages about the
-- presence of other clients.» INSERT = tracke (publish), SELECT = lytte
-- (receive). «For Presence messages, the value of realtime.messages.extension
-- is presence»; realtime.topic() «retrieves the Channel topic the user is
-- attempting to connect to».
--
--   Medlemmer:  INSERT for authenticated på emnet — de tracker sig selv.
--               INGEN SELECT: «With no policies, clients connect but receive
--               no messages» (Realtime Settings) — medlemmer ser ikke hinanden.
--   Rådgivere:  SELECT når has_role(auth.uid(), 'advisor') (admin arver).
--               Ingen INSERT: rådgiveren tracker aldrig (hooks/onlineMedlemmer).
--
-- KANALEN ER PRIVAT (config.private = true i klienten); «Allow public access»
-- forbliver SLÅET TIL — private kanaler håndhæver politikkerne uanset, og en
-- offentlig kanal med samme navn er en anden kanal («Realtime sees them as
-- unique channels», Realtime Concepts). De otte eksisterende
-- postgres_changes-kanaler røres ikke.
--
-- EMNET er 'online-medlemmer' = ONLINE_KANAL i src/lib/hjemmebane/online.ts —
-- ét sted i TS, ét literal her; kildeværnet online.guard.test.ts kræver at de
-- er ens.
--
-- UBEVIST ANTAGELSE (bevisplan (a) i rapport-online-medlemmer.md): at en
-- klient med KUN INSERT-ret kan joine en privat presence-kanal («To join a
-- Broadcast Channel, a user must have at least one read or write permission»
-- — for presence står det ikke ordret). Falder (a), ændres politikken/kanalen
-- i en ny migration; den rene kode, hooks og fladen står.
--
-- FØR-SQL (ét resultatsæt; gem som CSV og skriv navnet her):
--   select '1 politikker paa realtime.messages' as sektion,
--          concat(policyname, ' | ', cmd, ' | ', array_to_string(roles, ',')) as noegle,
--          concat('qual=', coalesce(qual, '-'), ' | check=', coalesce(with_check, '-')) as vaerdi
--     from pg_policies where schemaname = 'realtime' and tablename = 'messages'
--   union all
--   select '2 rls paa realtime.messages', 'relrowsecurity | relforcerowsecurity',
--          concat(c.relrowsecurity, ' | ', c.relforcerowsecurity)
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'realtime' and c.relname = 'messages'
--   union all
--   select '3 has_role fra authenticated', 'has_function_privilege',
--          has_function_privilege('authenticated', 'public.has_role(uuid, app_role)', 'execute')::text
--   union all
--   select '3 has_role fra authenticated', 'realtime.topic() findes',
--          (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--            where n.nspname = 'realtime' and p.proname = 'topic')
--   union all
--   select '4 raadgivere', 'user_roles advisor/admin', count(*)::text
--     from public.user_roles where role in ('advisor','admin')
--   union all
--   select '5 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 uden de to navne nedenfor (måles, ikke antages);
--   sektion 3: has_function_privilege = true (ellers STOP — en GRANT er en ny
--   beslutning) og realtime.topic() = 1.
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt. FACIT EFTER: sektion 1 har præcis de to nye rækker
--   «Medlemmer tracker sig i online-medlemmer | INSERT | {authenticated}» med
--   check på topic + presence, og «Raadgivere ser online-medlemmer | SELECT |
--   {authenticated}» med qual på topic + presence + has_role; sektion 2 og 3
--   uændrede fra FØR.
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK (ingen data, ingen funktioner røres; klienterne viser husets
-- kanalfejl-tekst, aldrig «ingen online»):
--   drop policy if exists "Medlemmer tracker sig i online-medlemmer" on realtime.messages;
--   drop policy if exists "Raadgivere ser online-medlemmer" on realtime.messages;

-- Medlemmer tracker sig selv: INSERT = «publish their presence».
create policy "Medlemmer tracker sig i online-medlemmer"
  on realtime.messages
  for insert
  to authenticated
  with check (
    (select realtime.topic()) = 'online-medlemmer'
    and realtime.messages.extension = 'presence'
  );

-- Kun rådgivere lytter: SELECT = «receive messages about the presence of other clients».
create policy "Raadgivere ser online-medlemmer"
  on realtime.messages
  for select
  to authenticated
  using (
    (select realtime.topic()) = 'online-medlemmer'
    and realtime.messages.extension = 'presence'
    and public.has_role((select auth.uid()), 'advisor'::app_role)
  );
