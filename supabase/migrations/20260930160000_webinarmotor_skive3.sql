-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- OG EFTER 20260930100000_webinarmotor_skive1.sql (den skaber tabellerne, som
-- denne fil tilføjer til), og FØR webinar-tilmeld, webinar-rum og
-- webinar-motor-cron udrulles: de læser kolonnen `intern` og svarer 500 uden den.
--
-- WEBINARMOTOREN, SKIVE 3 (30/9-2026) — det, der mangler til en INTERN
-- prøvesession (Jonas' beslutning D2.7: ingen offentlig parallelkørsel).
-- Dokumentet: docs/webinarmotor.md §7 (runbook).
--
-- KUN TILFØJENDE:
--   1. webinar_sessioner.intern (boolean, standard false) — en intern session
--      står aldrig i en offentlig liste, og kun husets egne adresser kan
--      tilmelde sig den (webinarMotor/tilmelding.ts:internDom).
--   2. To BEFORE UPDATE-triggers på NYE tabeller (skive 1's), ikke på nogen af
--      de forbudte (protect_*_immutable_fields, auth.users):
--        webinar_session_laast  — en sessions starter_at kan ikke flyttes, når
--          der er tilmeldte (deres session_tid, mails og .ics ville lyve: flyt
--          kræver en mailart og ics_sekvens + 1, spec §B3 — ikke bygget), og
--          webinar_id kan aldrig skifte.
--        webinar_tidslinje_frem — webinarer.tidslinje_version går kun frem (en
--          udgivet version er uforanderlig, skive 1's trigger), og slug'en kan
--          ikke skifte, når webinaret har sessioner (mailenes links bærer den).
--   3. RÅDGIVERNES SKRIVEADGANG til konfigurationen (skive 1 gav kun SELECT og
--      sagde, at skrivningen kom med en flade — det er /webinar/motor):
--        webinarer, webinar_sessioner: INSERT + UPDATE (ingen DELETE — en
--          session med tilmeldte er historik; aflys = status 'aflyst').
--        webinar_interaktioner: INSERT + UPDATE + DELETE, men KUN på en
--          KLADDE-version (version > webinarets udgivne tidslinje_version).
--          En udgivet version kan hverken ændres (skive 1's trigger) eller få
--          nye rækker eller miste rækker (politikkerne her).
--      Alle politikker: `to authenticated` + has_role(auth.uid(), 'advisor')
--      (admin arver advisor). Ingen anon-politik. has_role() er URØRT.
--      DROP POLICY IF EXISTS står KUN foran politikker, denne fil selv opretter
--      (husets idempotente form — en genkørsel af filen må ikke fejle).
--
-- INGEN ændring i eksisterende tabeller uden for motoren; ingen række ændres;
-- ingen app_config-række (låsene webinar_motor_aktiv og webinarmotor_meta_aktiv
-- er FRAVÆRENDE = false, fail-closed, som webinar_mail_aktiv).
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonne' as sektion, concat(table_name, '.', column_name) as noegle, data_type as vaerdi
--     from information_schema.columns where table_schema = 'public' and table_name = 'webinar_sessioner' and column_name = 'intern'
--   union all
--   select '2 triggere', tgname, tgrelid::regclass::text from pg_trigger
--    where tgname in ('webinar_session_laast', 'webinar_tidslinje_frem')
--   union all
--   select '3 politikker', concat(tablename, ': ', policyname), concat(cmd, ' | ', roles::text) from pg_policies
--    where schemaname = 'public' and tablename in ('webinarer', 'webinar_sessioner', 'webinar_interaktioner')
--   union all
--   select '4 raekker', 'webinar_sessioner', count(*)::text from public.webinar_sessioner
--   order by 1, 2;
--   FACIT FØR: sektion 1 og 2 TOMME; sektion 3 = to politikker pr. tabel (Service role … ALL,
--   Advisors can view … SELECT); sektion 4 = antallet af sessioner (notér det — 0, hvis intet er oprettet).
--
-- EFTER-SQL: filens sidste SELECT. FACIT EFTER: sektion 1 = webinar_sessioner.intern boolean;
--   sektion 2 = to triggere; sektion 3 = de to gamle + webinarer INSERT/UPDATE, webinar_sessioner
--   INSERT/UPDATE, webinar_interaktioner INSERT/UPDATE/DELETE (alle {authenticated});
--   sektion 4 uændret, og «intern true» = 0.
-- Og udefra, FØR udrulning: GET /rest/v1/webinar_sessioner?select=intern&limit=0 → 200.
--
-- ROLLBACK:
--   drop policy if exists "Advisors can insert webinarer" on public.webinarer;
--   drop policy if exists "Advisors can update webinarer" on public.webinarer;
--   drop policy if exists "Advisors can insert webinar_sessioner" on public.webinar_sessioner;
--   drop policy if exists "Advisors can update webinar_sessioner" on public.webinar_sessioner;
--   drop policy if exists "Advisors can insert kladde webinar_interaktioner" on public.webinar_interaktioner;
--   drop policy if exists "Advisors can update kladde webinar_interaktioner" on public.webinar_interaktioner;
--   drop policy if exists "Advisors can delete kladde webinar_interaktioner" on public.webinar_interaktioner;
--   drop trigger if exists webinar_session_laast on public.webinar_sessioner;
--   drop trigger if exists webinar_tidslinje_frem on public.webinarer;
--   drop function if exists public.webinar_session_laast(); drop function if exists public.webinar_tidslinje_frem();
--   alter table public.webinar_sessioner drop column if exists intern;

-- ── 1. Den interne session ──────────────────────────────────────────────────
alter table public.webinar_sessioner
  add column if not exists intern boolean not null default false;

comment on column public.webinar_sessioner.intern is
  'Webinarmotoren skive 3 (30/9-2026, beslutning D2.7): en INTERN prøvesession. Står aldrig i webinar-tilmeld «sessioner» eller i naesteSessioner; kun adresser på topix.dk/theboardroom.dk kan tilmelde sig (tilmelding.ts:internDom).';

-- ── 2. Triggerne (på NYE tabeller; SECURITY INVOKER) ────────────────────────
create or replace function public.webinar_session_laast()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.webinar_id is distinct from old.webinar_id then
    raise exception 'webinar_sessioner: en session kan ikke flyttes til et andet webinar' using errcode = '55000';
  end if;
  if new.starter_at is distinct from old.starter_at
     and exists (select 1 from public.webinar_tilmeldinger t where t.session_id = old.id) then
    raise exception 'webinar_sessioner: sessionen har tilmeldte — tidspunktet kan ikke flyttes (aflys og opret en ny)' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists webinar_session_laast on public.webinar_sessioner;
create trigger webinar_session_laast before update on public.webinar_sessioner
  for each row execute function public.webinar_session_laast();

create or replace function public.webinar_tidslinje_frem()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tidslinje_version < old.tidslinje_version then
    raise exception 'webinarer: tidslinje_version går kun frem (% → %)', old.tidslinje_version, new.tidslinje_version using errcode = '55000';
  end if;
  if new.slug is distinct from old.slug
     and exists (select 1 from public.webinar_sessioner s where s.webinar_id = old.id) then
    raise exception 'webinarer: webinaret har sessioner — slug''en står i mailenes links og kan ikke skifte' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists webinar_tidslinje_frem on public.webinarer;
create trigger webinar_tidslinje_frem before update on public.webinarer
  for each row execute function public.webinar_tidslinje_frem();

-- ── 3. Rådgivernes skriveadgang (RLS) ───────────────────────────────────────
drop policy if exists "Advisors can insert webinarer" on public.webinarer;
create policy "Advisors can insert webinarer" on public.webinarer
  for insert to authenticated with check (public.has_role(auth.uid(), 'advisor'));
drop policy if exists "Advisors can update webinarer" on public.webinarer;
create policy "Advisors can update webinarer" on public.webinarer
  for update to authenticated using (public.has_role(auth.uid(), 'advisor')) with check (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Advisors can insert webinar_sessioner" on public.webinar_sessioner;
create policy "Advisors can insert webinar_sessioner" on public.webinar_sessioner
  for insert to authenticated with check (public.has_role(auth.uid(), 'advisor'));
drop policy if exists "Advisors can update webinar_sessioner" on public.webinar_sessioner;
create policy "Advisors can update webinar_sessioner" on public.webinar_sessioner
  for update to authenticated using (public.has_role(auth.uid(), 'advisor')) with check (public.has_role(auth.uid(), 'advisor'));

-- KUN en kladde: version > webinarets udgivne tidslinje_version.
drop policy if exists "Advisors can insert kladde webinar_interaktioner" on public.webinar_interaktioner;
create policy "Advisors can insert kladde webinar_interaktioner" on public.webinar_interaktioner
  for insert to authenticated with check (
    public.has_role(auth.uid(), 'advisor')
    and version > (select w.tidslinje_version from public.webinarer w where w.id = webinar_id)
  );
drop policy if exists "Advisors can update kladde webinar_interaktioner" on public.webinar_interaktioner;
create policy "Advisors can update kladde webinar_interaktioner" on public.webinar_interaktioner
  for update to authenticated
  using (
    public.has_role(auth.uid(), 'advisor')
    and version > (select w.tidslinje_version from public.webinarer w where w.id = webinar_id)
  )
  with check (
    public.has_role(auth.uid(), 'advisor')
    and version > (select w.tidslinje_version from public.webinarer w where w.id = webinar_id)
  );
drop policy if exists "Advisors can delete kladde webinar_interaktioner" on public.webinar_interaktioner;
create policy "Advisors can delete kladde webinar_interaktioner" on public.webinar_interaktioner
  for delete to authenticated using (
    public.has_role(auth.uid(), 'advisor')
    and version > (select w.tidslinje_version from public.webinarer w where w.id = webinar_id)
  );

-- ── EFTER-tjek (ét resultatsæt — kør og gem CSV) ────────────────────────────
select '1 kolonne' as sektion, concat(table_name, '.', column_name) as noegle, data_type as vaerdi
  from information_schema.columns where table_schema = 'public' and table_name = 'webinar_sessioner' and column_name = 'intern'
union all
select '2 triggere', tgname, tgrelid::regclass::text from pg_trigger
 where tgname in ('webinar_session_laast', 'webinar_tidslinje_frem')
union all
select '3 politikker', concat(tablename, ': ', policyname), concat(cmd, ' | ', roles::text) from pg_policies
 where schemaname = 'public' and tablename in ('webinarer', 'webinar_sessioner', 'webinar_interaktioner')
union all
select '4 raekker', 'webinar_sessioner', count(*)::text from public.webinar_sessioner
union all
select '4 raekker', concat('intern ', intern::text), count(*)::text from public.webinar_sessioner group by intern
order by 1, 2;
