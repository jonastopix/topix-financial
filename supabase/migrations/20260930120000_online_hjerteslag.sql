-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «Online nu» som HJERTESLAG I EN TABEL (30/9-2026) — erstatter Presence-
-- kanalen fra 20260917100000_online_presence.sql i koden. Den gamle
-- migration og dens to politikker på realtime.messages STÅR (ingen DROP i
-- denne PR); klienten åbner ikke længere kanalen.
--
-- HVORFOR: «Online nu» på rådgivernes forside har aldrig vist et navn (Jonas
-- 30/9). Recon (recon-online-nu.md, kun fund): medlemmet har KUN INSERT på
-- den private kanal, og Supabases egen fejlsøgning siger «a select policy to
-- receive presence updates and an insert policy for channel.track()» og «On a
-- private channel, you need an RLS policy that allows the join for your
-- role» — et afvist join er TAVST (onlineTracking reagerede kun på
-- SUBSCRIBED). Ubevist, men uanset: at give medlemmer SELECT på kanalen ville
-- lade ALLE medlemmer se, hvem der er online (privatlivsbrud). Derfor en
-- tabel, hvis RLS vi kan måle med en SELECT, uden afhængighed af Realtime-
-- autorisation eller «Allow public access».
--
-- MODELLEN:
--   Medlemmet: upsert af EGEN række ved montering og hvert 60. sekund, mens
--              fanen er synlig (src/hooks/onlineTracking.ts). Fail-soft.
--   Rådgiveren: online_hjerteslag_friske(150) hvert 30. sekund + ved fokus
--              (src/hooks/onlineMedlemmer.ts) → den uændrede dom
--              onlineMedlemmer (rådgivere ud, ikke-kunder ud, legat mærket).
--   ONLINE = hjerteslag inden for de sidste 150 s. Regnestykket (online.ts,
--   vinduetHolder): værste afstand mellem to slag = interval 60 s + mindste
--   afstand 20 s (et slag ved montering springes over, hvis det forrige er
--   < 20 s gammelt, og det næste kommer et helt interval senere) = 80 s
--   < 150 s — ét tabt slag (80 + 60 = 140 s) holder stadig medlemmet inde.
--
-- POLITIKKERNE (PERMISSIVE — hver af dem GIVER, ingen NÆGTER):
--   INSERT  authenticated  with check user_id = auth.uid()   — kun egen række.
--   UPDATE  authenticated  using + with check user_id = auth.uid().
--   SELECT  authenticated  using user_id = auth.uid()        — EGEN række.
--           NØDVENDIG for upsert: PostgreSQL, CREATE POLICY, «Policies
--           Applied by Command Type»: for INSERT … ON CONFLICT DO UPDATE
--           gælder SELECT-politikken «Check existing & new rows» — UDEN
--           fodnote [a]'s forbehold (som UPDATE har). Uden den fejler hvert
--           slag efter det første med 42501. Medlemmet ser kun sig selv —
--           intet om andre.
--   SELECT  authenticated  using has_role(auth.uid(), 'advisor') — rådgivere
--           (admin arver) ser alle.
--   INGEN DELETE-politik; DELETE og TRUNCATE tilbagekaldt fra authenticated
--   (TRUNCATE ser ikke RLS), alt tilbagekaldt fra anon. Rækken forsvinder
--   kun med brugeren (on delete cascade — RI kører som tabellens ejer).
--   public.has_role KALDES, ændres ikke. Ingen SECURITY DEFINER.
--
-- SERVERENS UR, IKKE KLIENTENS: triggeren online_hjerteslag_servertid sætter
-- sidst_set = now() ved hver INSERT og UPDATE (SECURITY INVOKER). Klienten
-- sender kun user_id; et skævt ur eller en fremtidig tid kan ikke holde
-- nogen «online». Læsningen online_hjerteslag_friske(vindue_sekunder)
-- sammenligner med serverens now() (SECURITY INVOKER — RLS afgør, hvad
-- kalderen ser: rådgiveren alle, medlemmet sig selv).
--
-- ── FØR-SQL og EFTER-SQL (samme sæt, ét resultatsæt) ─────────────────────
--   select '1 tabel' as sektion, 'to_regclass' as noegle,
--          coalesce(to_regclass('public.online_hjerteslag')::text, '(findes ikke)') as vaerdi
--   union all
--   select '2 rls', 'relrowsecurity',
--          coalesce((select c.relrowsecurity::text from pg_class c where c.oid = to_regclass('public.online_hjerteslag')), '-')
--   union all
--   select '3 politik', concat(policyname, ' | ', cmd, ' | ', permissive, ' | ', array_to_string(roles, ',')),
--          concat('qual=', coalesce(qual, '-'), ' | check=', coalesce(with_check, '-'))
--     from pg_policies where schemaname = 'public' and tablename = 'online_hjerteslag'
--   union all
--   select '4 trigger', t.tgname, pg_get_triggerdef(t.oid)
--     from pg_trigger t where t.tgrelid = to_regclass('public.online_hjerteslag') and not t.tgisinternal
--   union all
--   select '5 funktion', concat(p.proname, '(', pg_get_function_identity_arguments(p.oid), ')'),
--          concat('security_definer=', p.prosecdef, ' | authenticated=', has_function_privilege('authenticated', p.oid, 'execute'),
--                 ' | anon=', has_function_privilege('anon', p.oid, 'execute'))
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('online_hjerteslag_friske', 'online_hjerteslag_servertid')
--   union all
--   select '6 rettighed', r.rolle || ' ' || r.ret,
--          coalesce(has_table_privilege(r.rolle, to_regclass('public.online_hjerteslag')::oid, r.ret)::text, '-')
--     from (values ('anon','SELECT'), ('anon','INSERT'), ('authenticated','SELECT'), ('authenticated','INSERT'),
--                  ('authenticated','UPDATE'), ('authenticated','DELETE'), ('authenticated','TRUNCATE')) as r(rolle, ret)
--   union all
--   select '7 realtime.messages (uroert)', concat(policyname, ' | ', cmd), '-'
--     from pg_policies where schemaname = 'realtime' and tablename = 'messages'
--   union all
--   select '8 has_role fra authenticated', 'execute',
--          has_function_privilege('authenticated', 'public.has_role(uuid, app_role)', 'execute')::text
--   union all
--   select '9 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--
--   FACIT FØR: 1 = «(findes ikke)»; 2 = «-»; ingen række i 3, 4, 5; alle i
--   6 = «-»; 7 = de to Presence-politikker (måles, ikke antages); 8 = true
--   (ellers STOP — en GRANT er en ny beslutning).
--   FØR-CSV: (indsættes her)
--
--   FACIT EFTER: 1 = public.online_hjerteslag; 2 = true; 3 = præcis fire
--   rækker, alle PERMISSIVE og {authenticated}: INSERT (check user_id =
--   auth.uid()), UPDATE (qual og check user_id = auth.uid()), SELECT egen
--   række, SELECT has_role advisor; 4 = én BEFORE INSERT OR UPDATE-trigger;
--   5 = to funktioner, begge security_definer=false, friske med
--   authenticated=true og anon=false; 6 = anon SELECT/INSERT false,
--   authenticated SELECT/INSERT/UPDATE true, DELETE/TRUNCATE false; 7 og 8
--   uændrede fra FØR.
--   EFTER-CSV: (indsættes her)
--
-- ── BEVIS-KØRSEL (efter migrationen; ALT rulles tilbage) ──────────────────
-- Hele blokken køres på én gang. Det SIDSTE resultatsæt er bevis-tabellen.
-- Medlemmet vælges i SQL'en: en bruger i en kunde-virksomhed (er_kunde ikke
-- false) uden rådgiverrolle; rådgiveren: en med rollen advisor.
--   begin;
--   create temp table bevis (trin int, sektion text, vaerdi text) on commit drop;
--   grant insert, select on bevis to authenticated;
--   select set_config('bevis.medlem', (select m.user_id::text from public.company_members m
--            join public.companies c on c.id = m.company_id
--           where c.er_kunde is distinct from false
--             and not exists (select 1 from public.user_roles r where r.user_id = m.user_id and r.role in ('advisor','admin'))
--           order by m.user_id limit 1), true);
--   select set_config('bevis.raadgiver', (select r.user_id::text from public.user_roles r
--           where r.role = 'advisor' order by r.user_id limit 1), true);
--   insert into public.online_hjerteslag (user_id) values (current_setting('bevis.raadgiver')::uuid)
--     on conflict (user_id) do update set user_id = excluded.user_id;
--   select set_config('request.jwt.claims',
--          json_build_object('sub', current_setting('bevis.medlem'), 'role', 'authenticated')::text, true);
--   set local role authenticated;
--   insert into public.online_hjerteslag (user_id, sidst_set) values (current_setting('bevis.medlem')::uuid, now() + interval '1 day')
--     on conflict (user_id) do update set user_id = excluded.user_id;
--   insert into public.online_hjerteslag (user_id) values (current_setting('bevis.medlem')::uuid)
--     on conflict (user_id) do update set user_id = excluded.user_id;
--   insert into bevis select 1, 'medlem: upsert af egen raekke to gange', count(*)::text
--     from public.online_hjerteslag where user_id = current_setting('bevis.medlem')::uuid;
--   insert into bevis select 2, 'medlem: sidst_set = serverens now() (ikke +1 dag)', bool_and(sidst_set = now())::text
--     from public.online_hjerteslag where user_id = current_setting('bevis.medlem')::uuid;
--   insert into bevis select 3, 'medlem: ser raekker i alt', count(*)::text from public.online_hjerteslag;
--   insert into bevis select 4, 'medlem: friske(150)', count(*)::text from public.online_hjerteslag_friske(150);
--   do $$ begin
--     begin
--       insert into public.online_hjerteslag (user_id) values (current_setting('bevis.raadgiver')::uuid)
--         on conflict (user_id) do update set user_id = excluded.user_id;
--       insert into bevis values (5, 'medlem: skriv andens raekke', 'SLAP IGENNEM');
--     exception when insufficient_privilege then
--       insert into bevis values (5, 'medlem: skriv andens raekke', 'afvist 42501');
--     end;
--   end $$;
--   do $$ declare n int; begin
--     update public.online_hjerteslag set user_id = user_id where user_id = current_setting('bevis.raadgiver')::uuid;
--     get diagnostics n = row_count;
--     insert into bevis values (6, 'medlem: update af andens raekke, raekker', n::text);
--   end $$;
--   do $$ declare n int; begin
--     delete from public.online_hjerteslag where user_id = current_setting('bevis.medlem')::uuid;
--     get diagnostics n = row_count;
--     insert into bevis values (7, 'medlem: delete af egen raekke, raekker', n::text);
--   exception when insufficient_privilege then
--     insert into bevis values (7, 'medlem: delete', 'afvist 42501');
--   end $$;
--   select set_config('request.jwt.claims',
--          json_build_object('sub', current_setting('bevis.raadgiver'), 'role', 'authenticated')::text, true);
--   insert into bevis select 8, 'raadgiver: ser raekker i alt', count(*)::text from public.online_hjerteslag;
--   insert into bevis select 9, 'raadgiver: friske(150)', count(*)::text from public.online_hjerteslag_friske(150);
--   reset role;
--   select trin, sektion, vaerdi, current_setting('bevis.medlem') as medlem, current_setting('bevis.raadgiver') as raadgiver
--     from bevis order by trin;
--   rollback;
--
--   FACIT: 1 = 1; 2 = true; 3 = 1 (kun sig selv, trods rådgiverens række);
--   4 = 1; 5 = «afvist 42501»; 6 = 0; 7 = «afvist 42501» (DELETE er
--   tilbagekaldt) — «0» ville også betyde, at intet blev slettet, men
--   «SLAP IGENNEM» eller 6/7 > 0 er et STOP; 8 = mindst 2; 9 = mindst 2.
--   Medlem og rådgiver er tomme (NULL) → STOP, intet er bevist.
--   BEVIS-CSV: (indsættes her)
--
-- ── BEVIS I DRIFT (efter migration + Update) ──────────────────────────────
--   Testkontoen kontakt@topix.dk (Topix.dk ApS, er_kunde=false) FILTRERES
--   STADIG FRA med vilje af dommen — den kan skrive hjerteslag, men vises
--   aldrig. Beviset er ENTEN et rigtigt kundemedlem logget ind og vist
--   under «Online nu», ELLER denne SELECT (rækker med sekunder siden
--   sidste slag; en række pr. medlem, der har haft appen åben):
--     select h.user_id, u.email, h.sidst_set,
--            extract(epoch from now() - h.sidst_set)::int as sekunder_siden
--       from public.online_hjerteslag h join auth.users u on u.id = h.user_id
--      order by h.sidst_set desc;
--
-- ROLLBACK (ingen data uden for tabellen; klienten viser husets fejltekst,
-- aldrig «ingen online», når funktionen mangler):
--   drop function if exists public.online_hjerteslag_friske(integer);
--   drop table if exists public.online_hjerteslag;
--   drop function if exists public.online_hjerteslag_servertid();

create table public.online_hjerteslag (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sidst_set timestamptz not null default now()
);

alter table public.online_hjerteslag enable row level security;

revoke all on table public.online_hjerteslag from anon;
revoke delete, truncate on table public.online_hjerteslag from authenticated;

-- Serverens ur: klienten kan hverken skrive en fremtidig eller en gammel tid.
create function public.online_hjerteslag_servertid()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.sidst_set := now();
  return new;
end;
$$;

create trigger online_hjerteslag_servertid
  before insert or update on public.online_hjerteslag
  for each row execute function public.online_hjerteslag_servertid();

-- Medlemmet skriver KUN sin egen række.
create policy "Medlem skriver eget hjerteslag"
  on public.online_hjerteslag
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Medlem opdaterer eget hjerteslag"
  on public.online_hjerteslag
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Nødvendig for upsert (ON CONFLICT DO UPDATE tjekker SELECT-politikken på
-- den eksisterende række); medlemmet ser kun sig selv.
create policy "Medlem ser eget hjerteslag"
  on public.online_hjerteslag
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Rådgivere (admin arver) ser alle.
create policy "Raadgivere ser hjerteslag"
  on public.online_hjerteslag
  for select
  to authenticated
  using (public.has_role((select auth.uid()), 'advisor'::app_role));

-- Friske hjerteslag målt mod SERVERENS ur. SECURITY INVOKER: RLS afgør.
create function public.online_hjerteslag_friske(vindue_sekunder integer)
  returns table (user_id uuid)
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select h.user_id
    from public.online_hjerteslag h
   where h.sidst_set > now() - make_interval(secs => vindue_sekunder)
   order by h.user_id;
$$;

revoke all on function public.online_hjerteslag_friske(integer) from public, anon;
grant execute on function public.online_hjerteslag_friske(integer) to authenticated;
