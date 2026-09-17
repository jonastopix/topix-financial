-- KØRT i prod 17/9-2026 13:22 (Jonas' SQL editor; EFTER-CSV
-- query-results-export-2026-09-17_13-22-02.csv): jonas@topix.dk «advisor,
-- admin, partner», morten@molainvest.dk «advisor, partner»; 2 partnere i
-- alt; politikkerne på kontrakter er «Partners can view kontrakter» og
-- «Service role can manage kontrakter»; hent_oekonomi_overblik findes,
-- prosecdef true, search_path=public; has_function_privilege: anon false,
-- authenticated true, service_role true. Kørt som NY kørsel EFTER
-- 20260918110000_app_role_partner.sql (13:21) — enum-værdien 'partner'
-- kan ikke bruges i samme transaktion.
-- SECURITY DEFINER-funktionen (CLAUDE.md FORBIDDEN uden grønt lys) —
-- Jonas 17/9 (ordret): «Ja, hvis du mener det er den stærkeste vej at gå
-- med det bedste og holdbareste resultat, så gør vi det.»
-- DEPLOY (historik): manuelt i Lovable → SQL editor (Ø2 migration B).
--
-- Tre ting (Ø2, 18/9-2026 — recon-oekonomi-dashboard.md §6 og §10.4;
-- Jonas 17/9, ordret: «1. Kun mig og Morten»):
--
--   (a) ROLLERNE: user_roles-rækker med 'partner' til præcis Jonas
--       (jonas@topix.dk) og Morten (morten@molainvest.dk), slået op på
--       auth.users.email. VÆRN: præcis én bruger pr. mail, ellers STOP
--       (hele kørslen rulles tilbage). Idempotent: UNIQUE (user_id, role)
--       + ON CONFLICT DO NOTHING. Ingen andre rækker røres.
--
--   (b) KONTRAKTERNE strammes: «Advisors can view kontrakter» (Ø1,
--       20260918100000) erstattes af «Partners can view kontrakter»
--       (has_role(auth.uid(), 'partner')). Ingen rådgiver uden partner kan
--       læse tabellen — hverken via PostgREST eller via RPC'en.
--       «Service role can manage kontrakter» bliver (backfill, webhook).
--
--   (c) RPC'en public.hent_oekonomi_overblik(): SECURITY DEFINER, SET
--       search_path = public. FØRSTE sætning: IF NOT has_role(auth.uid(),
--       'partner') THEN RAISE EXCEPTION. Returnerer ét jsonb-objekt med
--       alt motoren (src/lib/oekonomi/omsaetning.ts) skal bruge:
--         kontrakter   — alle kolonner i public.kontrakter
--         betalinger   — company_traek: company_id, betalt_at, status, kilde,
--                        faktura_nummer, beloeb_oere, moms_oere og
--                        beloeb_eks_moms_oere = beloeb_oere − coalesce(moms_oere, 0)
--                        (moms NULL = ukendt → beløbet inkl. moms; ingen 25 %
--                        antages — reglen fra 20260917120000)
--         virksomheder — companies: id, name, status, contract_start_date,
--                        contract_end_date, er_kunde, is_legat
--         hentet_at    — now()
--       Hvorfor DEFINER: company_traek og companies har rådgiver-læsning,
--       men kontrakter har det ikke længere (b) — én funktion, ét
--       adgangstjek, ét svar. Ingen parametre: partneren får ALT, og
--       vinduet (fra/til) er motorens sag i browseren.
--       GRANT EXECUTE til authenticated (og service_role); REVOKE fra
--       PUBLIC og anon — en uindlogget kan ikke engang kalde og få fejlen.
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 brugere' as sektion, u.email as noegle, concat(count(*) over (partition by u.email), ' | ', u.id) as vaerdi
--     from auth.users u where lower(u.email) in ('jonas@topix.dk', 'morten@molainvest.dk')
--   union all
--   select '2 roller', u.email, string_agg(r.role::text, ', ' order by r.role)
--     from public.user_roles r join auth.users u on u.id = r.user_id
--    where lower(u.email) in ('jonas@topix.dk', 'morten@molainvest.dk') group by u.email
--   union all
--   select '3 partnere i alt', 'antal', count(*)::text from public.user_roles where role = 'partner'
--   union all
--   select '4 politikker kontrakter', p.policyname, concat(p.cmd, ' | ', p.roles::text, ' | ', p.qual)
--     from pg_policies p where p.schemaname = 'public' and p.tablename = 'kontrakter'
--   union all
--   select '5 funktionen', 'findes | definer | search_path', concat(count(*), ' | ', bool_or(p.prosecdef), ' | ', string_agg(array_to_string(p.proconfig, ','), ''))
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'hent_oekonomi_overblik'
--   union all
--   select '6 enum', 'partner findes', count(*)::text from pg_enum e where e.enumtypid = 'public.app_role'::regtype and e.enumlabel = 'partner'
--   union all
--   select '7 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 = to rækker, begge «1 | <uuid>» (målt 6/9: jonas 23e81de4-…, morten b4dcc529-…);
--   sektion 2: jonas «admin, advisor», morten «advisor»; sektion 3 = 0; sektion 4 = «Advisors can
--   view kontrakter» + «Service role can manage kontrakter»; sektion 5 = «0 | | »; sektion 6 = 1
--   (ellers er migration A ikke kørt: STOP).
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt plus
--   select '8 grants', r.rolle, has_function_privilege(r.rolle, 'public.hent_oekonomi_overblik()', 'EXECUTE')::text
--     from (values ('anon'), ('authenticated'), ('service_role')) as r(rolle)
--   FACIT EFTER: sektion 2: jonas «admin, advisor, partner», morten «advisor, partner»;
--   sektion 3 = 2; sektion 4 = «Partners can view kontrakter» (SELECT, {authenticated},
--   has_role(auth.uid(), 'partner'::app_role)) + «Service role can manage kontrakter»;
--   sektion 5 = «1 | true | search_path=public»; sektion 8: anon false, authenticated true,
--   service_role true.
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK (én kørsel):
--   drop function if exists public.hent_oekonomi_overblik();
--   drop policy if exists "Partners can view kontrakter" on public.kontrakter;
--   create policy "Advisors can view kontrakter" on public.kontrakter for select to authenticated
--     using (has_role(auth.uid(), 'advisor'::app_role));
--   delete from public.user_roles where role = 'partner';
--   (enum-værdien bliver stående — se migration A.)

begin;

-- (a) rollerne — værn: præcis én bruger pr. mail
do $$
declare
  n_jonas integer;
  n_morten integer;
begin
  select count(*) into n_jonas from auth.users where lower(email) = 'jonas@topix.dk';
  select count(*) into n_morten from auth.users where lower(email) = 'morten@molainvest.dk';
  if n_jonas <> 1 then
    raise exception 'STOP: jonas@topix.dk matcher % brugere i auth.users (skal være 1)', n_jonas;
  end if;
  if n_morten <> 1 then
    raise exception 'STOP: morten@molainvest.dk matcher % brugere i auth.users (skal være 1)', n_morten;
  end if;
end $$;

insert into public.user_roles (user_id, role)
select u.id, 'partner'::app_role
  from auth.users u
 where lower(u.email) in ('jonas@topix.dk', 'morten@molainvest.dk')
on conflict (user_id, role) do nothing;

do $$
declare n integer;
begin
  select count(*) into n from public.user_roles where role = 'partner';
  if n <> 2 then
    raise exception 'STOP: % partnere efter indsættelsen, forventede præcis 2', n;
  end if;
end $$;

-- (b) kontrakter: kun partnere læser
drop policy if exists "Advisors can view kontrakter" on public.kontrakter;
drop policy if exists "Partners can view kontrakter" on public.kontrakter;
create policy "Partners can view kontrakter"
  on public.kontrakter for select to authenticated
  using (has_role(auth.uid(), 'partner'::app_role));

-- (c) RPC'en
create or replace function public.hent_oekonomi_overblik()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_role(auth.uid(), 'partner') then
    raise exception 'Adgang nægtet: økonomioverblikket kan kun læses af partnere (Jonas og Morten)';
  end if;

  return jsonb_build_object(
    'kontrakter', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'company_id', k.company_id,
        'periode_start', k.periode_start,
        'periode_slut', k.periode_slut,
        'grundpris_oere', k.grundpris_oere,
        'pris_eks_moms_oere', k.pris_eks_moms_oere,
        'betalingsmodel', k.betalingsmodel,
        'kilde', k.kilde,
        'periode_id', k.periode_id,
        'note', k.note,
        'created_at', k.created_at
      ) order by k.company_id, k.periode_start)
      from public.kontrakter k
    ), '[]'::jsonb),
    'betalinger', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'company_id', t.company_id,
        'betalt_at', t.betalt_at,
        'status', t.status,
        'kilde', t.kilde,
        'art', t.art,
        'faktura_nummer', t.faktura_nummer,
        'beloeb_oere', t.beloeb_oere,
        'moms_oere', t.moms_oere,
        'beloeb_eks_moms_oere', t.beloeb_oere - coalesce(t.moms_oere, 0),
        'periode_start', t.periode_start,
        'periode_slut', t.periode_slut
      ) order by t.betalt_at nulls last, t.id)
      from public.company_traek t
    ), '[]'::jsonb),
    'virksomheder', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'status', c.status,
        'contract_start_date', c.contract_start_date,
        'contract_end_date', c.contract_end_date,
        'er_kunde', c.er_kunde,
        'is_legat', c.is_legat
      ) order by c.name)
      from public.companies c
    ), '[]'::jsonb),
    'hentet_at', now()
  );
end;
$$;

comment on function public.hent_oekonomi_overblik() is
  'Økonomioverblikket til partnerne (Jonas og Morten) — Ø2, 18/9-2026. SECURITY DEFINER; første sætning er has_role(auth.uid(), ''partner''), ellers exception. Returnerer kontrakter (alle kolonner), betalinger fra company_traek ekskl. moms (beloeb_oere − coalesce(moms_oere, 0)) og virksomheder. Regnes i browseren af src/lib/oekonomi/omsaetning.ts.';

revoke all on function public.hent_oekonomi_overblik() from public;
revoke all on function public.hent_oekonomi_overblik() from anon;
grant execute on function public.hent_oekonomi_overblik() to authenticated;
grant execute on function public.hent_oekonomi_overblik() to service_role;

commit;

select
  (select count(*) from public.user_roles where role = 'partner') as partnere,
  (select string_agg(policyname, ' | ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'kontrakter') as politikker,
  has_function_privilege('anon', 'public.hent_oekonomi_overblik()', 'EXECUTE') as anon_maa_kalde,
  has_function_privilege('authenticated', 'public.hent_oekonomi_overblik()', 'EXECUTE') as authenticated_maa_kalde;
