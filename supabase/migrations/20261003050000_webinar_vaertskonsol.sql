-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- OG EFTER 20261003010000_webinarmotor_skive1.sql (den skaber webinar_spoergsmaal).
-- Uafhængig af 20261003030000/031000/040000 (rører ingen af deres objekter).
--
-- WEBINARMOTOREN — VÆRTSKONSOLLEN, MINIMAL (3/10-2026, docs/webinarmotor.md §7.7).
-- Rådgiveren svarer på seerens spørgsmål på /webinar/motor/session/:id.
--
-- MÅLT FØR DENNE FIL (kodelæst i de to reviewede migrationer, IKKE i prod — de er ikke kørt):
--   20261003010000: webinar_spoergsmaal har RLS; «Service role can manage» (ALL) og
--     «Advisors can view» (SELECT to authenticated, has_role advisor — tjenestekonti
--     INKLUDERET, da politikken ikke udelukker dem). INGEN UPDATE-politik for rådgivere,
--     INGEN trigger på tabellen. 20261003030000 rører ikke tabellen.
--   Svarvejen til seeren (webinar-puls, trin 3): service role læser rækker med
--     tilmelding_id = seerens, status = 'besvaret' og leveret IS NULL og sender
--     svar_tekst; derefter sættes leveret = 'live', leveret_at = nu. Svaret skal altså
--     stå i svar_tekst med status 'besvaret' — og leveret skal være NULL.
--
-- KUN TILFØJENDE:
--   1. ÉN UPDATE-politik: rådgivere (has_role advisor, admin arver) MINUS tjenestekonti
--      (husets mønster for skrivning, som opkaldsanmodninger 2/10: en maskinkonto ser,
--      den svarer aldrig). Subforespørgslen læser tjenestekonti som authenticated
--      («Indloggede ser tjenestekonti», USING true) — ingen SECURITY DEFINER-hjælper.
--      SELECT-politikken fra skive 1 er urørt (ingen DROP POLICY på den).
--   2. ÉN BEFORE UPDATE-trigger på den NYE tabel (ikke en af de forbudte
--      protect_*_immutable_fields, ikke auth.users), SECURITY INVOKER, samme form som
--      opkald_raadgiver_kolonnevaern: et KLIENTkald (authenticated/anon) må KUN ændre
--      status, svar_tekst, svaret_af og svaret_at — seerens felter (tekst, pos_sek,
--      stillet_at, art, session_id, tilmelding_id), leveringen (leveret, leveret_at —
--      pulsens) og kurateringen (offentlig, offentlig_tekst — skive 5) er urørlige.
--      Desuden: ÉT svar pr. spørgsmål — kun 'ny' → 'besvaret' (aldrig en rettelse:
--      pulsen kan have læst teksten, før rettelsen lander, og seeren ville få en anden
--      tekst end den, der står her); leveret skal være NULL; svaret 1–1000 tegn efter
--      trim (konsollens dom, lib/webinarMotorAdmin/konsol.ts:laesSvar); svaret_af =
--      auth.uid(); svaret_at = serverens now() (klientens værdi ignoreres).
--      service_role og postgres uden JWT (pulsen, SQL editoren) passerer.
--   3. ÉN læsefunktion public.webinar_server_nu() — serverens ur til konsollens
--      positionDom (urForskydning, samme regnestykke som seerens rum). SECURITY INVOKER,
--      STABLE, ingen tabel, ingen data: `select now()`. EXECUTE kun authenticated.
--
-- Ingen SECURITY DEFINER. Ingen anon-politik. has_role() urørt. DROP POLICY/TRIGGER IF
-- EXISTS står KUN foran objekter, denne fil selv opretter (idempotens).
--
-- FØR-SQL (ét resultatsæt — kør og gem CSV):
--   select '1 politikker' as sektion, policyname as noegle, concat(cmd, ' | ', roles::text) as vaerdi
--     from pg_policies where schemaname = 'public' and tablename = 'webinar_spoergsmaal'
--   union all
--   select '2 trigger', tgname, tgrelid::regclass::text from pg_trigger
--    where tgrelid = 'public.webinar_spoergsmaal'::regclass and not tgisinternal
--   union all
--   select '3 funktion', p.proname, pg_get_function_identity_arguments(p.oid) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'webinar_server_nu'
--   union all
--   select '4 grant', 'authenticated UPDATE', has_table_privilege('authenticated', 'public.webinar_spoergsmaal', 'UPDATE')::text
--   union all
--   select '5 raekker', status, count(*)::text from public.webinar_spoergsmaal group by status
--   order by 1, 2;
--   FACIT FØR: sektion 1 = «Advisors can view webinar_spoergsmaal» (SELECT) + «Service role can
--   manage webinar_spoergsmaal» (ALL); sektion 2 og 3 TOMME; sektion 4 = true (Supabases
--   standardrettigheder — RLS er porten; er den false, STOP: så kan ingen rådgiver svare,
--   og en GRANT skal besluttes for sig); sektion 5 = rækkerne pr. status (notér).
--
-- EFTER-SQL: filens sidste SELECT (ét resultatsæt). FACIT EFTER:
--   sektion 1 = de to gamle + «Advisors can answer webinar_spoergsmaal» (UPDATE | {authenticated});
--   sektion 2 = webinar_spoergsmaal_vaert_kolonnevaern; sektion 3 = webinar_server_nu;
--   sektion 4 = true; sektion 5 uændret; sektion 6 «execute» = anon false, authenticated true.
-- Udefra, FØR Update: konsollen læser kun eksisterende kolonner; beviset er, at et svar
--   gemmes (fladen siger ellers «kræver migrationen»).
--
-- PRØVE i én transaktion (rul tilbage), når der findes et spørgsmål med status 'ny' og leveret null.
-- Et fejlende UPDATE afbryder transaktionen — derfor står hvert forventet nej bag en SAVEPOINT,
-- og «0 rækker» læses i SQL editorens «UPDATE 0». Skift bruger med set_config (tredje argument
-- true = kun i transaktionen). Forventet udfald står efter hver linje:
--   begin;
--   set local role authenticated;
--   -- a) tjenestekonto (en user_id i public.tjenestekonti, med advisor-rolle):
--   select set_config('request.jwt.claims', json_build_object('sub', '<tjenestekontoens uuid>', 'role', 'authenticated')::text, true);
--   update public.webinar_spoergsmaal set status = 'besvaret', svar_tekst = 'Hej', svaret_af = '<tjenestekontoens uuid>' where id = '<id>';  -- → UPDATE 0 (RLS: politikken udelukker tjenestekonti)
--   -- b) medlem (ingen advisor-rolle):
--   select set_config('request.jwt.claims', json_build_object('sub', '<medlemmets uuid>', 'role', 'authenticated')::text, true);
--   update public.webinar_spoergsmaal set status = 'besvaret', svar_tekst = 'Hej', svaret_af = '<medlemmets uuid>' where id = '<id>';      -- → UPDATE 0 (RLS: ingen politik siger ja)
--   -- c) rådgiveren:
--   select set_config('request.jwt.claims', json_build_object('sub', '<rådgiverens uuid>', 'role', 'authenticated')::text, true);
--   savepoint p1;
--   update public.webinar_spoergsmaal set tekst = 'x' where id = '<id>';                                                                    -- → FEJL 42501 (seerens felt)
--   rollback to savepoint p1;
--   savepoint p2;
--   update public.webinar_spoergsmaal set status = 'besvaret', svar_tekst = 'Hej', svaret_af = gen_random_uuid() where id = '<id>';         -- → FEJL 42501 (svaret_af ≠ dig)
--   rollback to savepoint p2;
--   update public.webinar_spoergsmaal set status = 'besvaret', svar_tekst = '  Hej  ', svaret_af = '<rådgiverens uuid>' where id = '<id>' returning svar_tekst, svaret_at; -- → 1 række, svar_tekst = 'Hej', svaret_at = now()
--   -- d) andet svar på samme spørgsmål:
--   savepoint p3;
--   update public.webinar_spoergsmaal set status = 'besvaret', svar_tekst = 'Rettet', svaret_af = '<rådgiverens uuid>' where id = '<id>';   -- → FEJL 55000 (allerede besvaret)
--   rollback to savepoint p3;
--   rollback;
--
-- ROLLBACK:
--   drop trigger if exists webinar_spoergsmaal_vaert_kolonnevaern on public.webinar_spoergsmaal;
--   drop function if exists public.webinar_spoergsmaal_vaert_kolonnevaern();
--   drop policy if exists "Advisors can answer webinar_spoergsmaal" on public.webinar_spoergsmaal;
--   drop function if exists public.webinar_server_nu();

-- ── 1. Kolonneværnet for rådgiverens UPDATE ─────────────────────────────────
create or replace function public.webinar_spoergsmaal_vaert_kolonnevaern()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- De fire kolonner, en klient (rådgiver) må ændre. Alt andet er seerens, pulsens eller skive 5's.
  tilladte constant text[] := array['status', 'svar_tekst', 'svaret_af', 'svaret_at'];
  jwt_rolle text := coalesce(auth.role(), '');
  aendrede text;
begin
  -- Kun klientkald bedømmes: service_role (webinar-puls sætter leveret) og postgres uden JWT passerer.
  if current_user::text not in ('authenticated', 'anon') and jwt_rolle not in ('authenticated', 'anon') then
    return new;
  end if;

  if (to_jsonb(new) - tilladte) is distinct from (to_jsonb(old) - tilladte) then
    select string_agg(n.key, ', ' order by n.key)
      into aendrede
      from jsonb_each(to_jsonb(new) - tilladte) n
     where n.value is distinct from (to_jsonb(old) -> n.key);
    raise exception 'Rådgivere må kun svare (status, svar_tekst, svaret_af, svaret_at) på et webinarspørgsmål: %', aendrede
      using errcode = '42501',
            hint = 'Kolonneværnet på webinar_spoergsmaal (migration 20261003050000).';
  end if;

  -- ÉT svar pr. spørgsmål, og kun før pulsen har leveret noget.
  if old.status is distinct from 'ny' or old.leveret is not null then
    raise exception 'Spørgsmålet er allerede besvaret eller leveret' using errcode = '55000';
  end if;
  if new.status is distinct from 'besvaret' then
    raise exception 'Konsollen kan kun sætte status «besvaret»' using errcode = '42501';
  end if;
  if new.svar_tekst is null or length(btrim(new.svar_tekst)) not between 1 and 1000 then
    raise exception 'Svaret skal være 1–1000 tegn' using errcode = '23514';
  end if;
  if new.svaret_af is distinct from auth.uid() then
    raise exception 'svaret_af skal være dig selv' using errcode = '42501';
  end if;

  new.svar_tekst := btrim(new.svar_tekst);
  -- Serverens ur — aldrig klientens.
  new.svaret_at := now();
  return new;
end;
$$;

comment on function public.webinar_spoergsmaal_vaert_kolonnevaern() is
  'BEFORE UPDATE på webinar_spoergsmaal (værtskonsollen, 3/10-2026): en klient (rådgiver) må kun ændre status/svar_tekst/svaret_af/svaret_at, kun ny → besvaret, kun når leveret er null, svaret 1–1000 tegn (trimmet), svaret_af = auth.uid(), svaret_at = now(). service_role/postgres passerer. Migration 20261003050000.';

drop trigger if exists webinar_spoergsmaal_vaert_kolonnevaern on public.webinar_spoergsmaal;
create trigger webinar_spoergsmaal_vaert_kolonnevaern
  before update on public.webinar_spoergsmaal
  for each row execute function public.webinar_spoergsmaal_vaert_kolonnevaern();

-- ── 2. RLS: rådgivere (ikke tjenestekonti) må svare ─────────────────────────
-- PERMISSIVE og giver kun JA; tjenestekontoen får nej til UPDATE, fordi ingen politik
-- siger ja til den. Kolonnerne afgrænses af triggeren ovenfor (RLS kan ikke se kolonner).
drop policy if exists "Advisors can answer webinar_spoergsmaal" on public.webinar_spoergsmaal;
create policy "Advisors can answer webinar_spoergsmaal" on public.webinar_spoergsmaal
  for update to authenticated
  using (
    public.has_role(auth.uid(), 'advisor')
    and not exists (select 1 from public.tjenestekonti tk where tk.user_id = auth.uid())
  )
  with check (
    public.has_role(auth.uid(), 'advisor')
    and not exists (select 1 from public.tjenestekonti tk where tk.user_id = auth.uid())
  );

-- ── 3. Serverens ur (til konsollens positionDom) ────────────────────────────
create or replace function public.webinar_server_nu()
returns timestamptz
language sql
stable
security invoker
set search_path = public
as $$
  select now();
$$;

comment on function public.webinar_server_nu() is
  'Serverens ur til værtskonsollen (/webinar/motor/session/:id): klienten måler sendt/modtaget og regner urForskydning som seerens rum. Ingen data. Migration 20261003050000.';

revoke all on function public.webinar_server_nu() from public, anon;
grant execute on function public.webinar_server_nu() to authenticated;

-- ── EFTER-tjek (ét resultatsæt — kør og gem CSV) ────────────────────────────
select '1 politikker' as sektion, policyname as noegle, concat(cmd, ' | ', roles::text) as vaerdi
  from pg_policies where schemaname = 'public' and tablename = 'webinar_spoergsmaal'
union all
select '2 trigger', tgname, tgrelid::regclass::text from pg_trigger
 where tgrelid = 'public.webinar_spoergsmaal'::regclass and not tgisinternal
union all
select '3 funktion', p.proname, pg_get_function_identity_arguments(p.oid) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'webinar_server_nu'
union all
select '4 grant', 'authenticated UPDATE', has_table_privilege('authenticated', 'public.webinar_spoergsmaal', 'UPDATE')::text
union all
select '5 raekker', status, count(*)::text from public.webinar_spoergsmaal group by status
union all
select '6 execute', 'anon', has_function_privilege('anon', 'public.webinar_server_nu()', 'execute')::text
union all
select '6 execute', 'authenticated', has_function_privilege('authenticated', 'public.webinar_server_nu()', 'execute')::text
order by 1, 2;
