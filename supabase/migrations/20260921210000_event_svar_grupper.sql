-- KØRT i prod — 21/9-2026 kl. 14:27 (Jonas, Lovable SQL editor), FØR merge, med et værn først (funktionerne fandtes ikke). EFTER: begge definer | search_path=public; event_svar_grupper kun service_role; get_event_svaroversigt authenticated + service_role. Prøve 14:27: Konkret case (Livja) 7/1/18.
--
-- DE TRE SVARGRUPPER PÅ ET EVENT (udkast 21/9-2026, Jonas' beslutning 21/9):
--   tilmeldt · kan_ikke · har_ikke_svaret — dømt ÉT sted i basen
--   (event_svar_grupper) og ÉT sted i koden (_shared/eventSvar.ts, samme regel,
--   låst af eventSvar.guard). Rådgivere tæller aldrig med.
--
-- ADGANGEN er events-RLS'ens regel — har_aktivt_medlemskab (fail-closed:
-- company_members → companies med is_legat = false, contract_end_date sat, og
-- slutdagen talt med; 20260907141500). IKKE publiceringsmailens regel
-- (get_event_non_responders: is_membership_active — fail-open, NULL slutdato =
-- adgang, abonnement tæller — plus ikke legat_enrollments). Forskellen mellem
-- de to mængder tælles af SQL'en nederst (kør FØR merge).
--
-- TO FUNKTIONER:
--   1. public.event_svar_grupper(uuid): (user_id, gruppe) for alle med adgang,
--      uden rådgivere. SECURITY DEFINER (læser company_members/companies/
--      event_registrations på tværs af RLS). EXECUTE KUN til service_role —
--      det er flyt-events modtagerliste, ikke en flade.
--   2. public.get_event_svaroversigt(uuid): rådgiverens oversigt med navn og
--      virksomhed. SECURITY DEFINER, FØRSTE sætning: IF NOT has_role(auth.uid(),
--      'advisor') THEN RAISE EXCEPTION (admin arver advisor). EXECUTE til
--      authenticated (så fladen kan kalde den) og service_role; ingen til anon.
--      Bygger PÅ (1), så de to kan ikke dømme forskelligt.
--
-- Medlemmernes visning (get_event_participants, kun tilmeldte, aldrig tal) er
-- URØRT. get_event_non_responders er URØRT (publiceringsmail og uge-påmindelse).
--
-- FØR-SQL (ét resultatsæt — kør FØR migrationen, gem CSV):
--   select '1 funktion' as sektion, p.proname as noegle, 'findes' as vaerdi
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('event_svar_grupper', 'get_event_svaroversigt')
--   union all
--   select '2 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 TOM.
--
-- ROLLBACK:
--   drop function if exists public.get_event_svaroversigt(uuid);
--   drop function if exists public.event_svar_grupper(uuid);

-- ── 1) Grupperne — ÉN regel ─────────────────────────────────────────────────
create or replace function public.event_svar_grupper(p_event_id uuid)
returns table(user_id uuid, gruppe text)
language sql
stable
security definer
set search_path = public
as $$
  with med_adgang as (
    -- Adgangen som events-RLS'en dømmer den (har_aktivt_medlemskab), aldrig rådgivere.
    select distinct cm.user_id
    from public.company_members cm
    where public.har_aktivt_medlemskab(cm.user_id)
      and not public.has_role(cm.user_id, 'advisor')
  ),
  aktiv as (
    -- Den aktive række: cancelled_at null. Afmelding og trukket afbud har cancelled_at sat.
    select er.user_id, er.response
    from public.event_registrations er
    where er.event_id = p_event_id
      and er.cancelled_at is null
  )
  select m.user_id,
         case
           when a.response = 'attending' then 'tilmeldt'
           when a.response = 'declined'  then 'kan_ikke'
           else 'har_ikke_svaret'
         end as gruppe
  from med_adgang m
  left join aktiv a on a.user_id = m.user_id
$$;

comment on function public.event_svar_grupper(uuid) is
  'De tre svargrupper på et event (21/9): tilmeldt (attending, cancelled_at null) · kan_ikke (declined, cancelled_at null) · har_ikke_svaret (adgang uden aktiv række). Adgang = har_aktivt_medlemskab (events-RLS), aldrig rådgivere. Samme regel som _shared/eventSvar.ts. Kun service_role må kalde den (flyt-event).';

revoke all on function public.event_svar_grupper(uuid) from public;
revoke all on function public.event_svar_grupper(uuid) from anon;
revoke all on function public.event_svar_grupper(uuid) from authenticated;
grant execute on function public.event_svar_grupper(uuid) to service_role;

-- ── 2) Rådgiverens oversigt — afviser selv alle uden rollen ───────────────
create or replace function public.get_event_svaroversigt(p_event_id uuid)
returns table(gruppe text, user_id uuid, full_name text, company_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_role(auth.uid(), 'advisor') then
    raise exception 'Adgang nægtet: svaroversigten kan kun læses af rådgivere';
  end if;

  return query
    select g.gruppe,
           g.user_id,
           p.full_name,
           c.name as company_name
    from public.event_svar_grupper(p_event_id) g
    left join public.profiles p on p.user_id = g.user_id
    left join public.companies c on c.id = public.user_company_id(g.user_id)
    order by g.gruppe, p.full_name nulls last;
end;
$$;

comment on function public.get_event_svaroversigt(uuid) is
  'Rådgiverens svaroversigt på eventsiden (21/9): de tre grupper med navn og virksomhed. Afviser selv alle uden has_role advisor (admin arver). Bygger på event_svar_grupper — samme regel.';

revoke all on function public.get_event_svaroversigt(uuid) from public;
revoke all on function public.get_event_svaroversigt(uuid) from anon;
grant execute on function public.get_event_svaroversigt(uuid) to authenticated;
grant execute on function public.get_event_svaroversigt(uuid) to service_role;

-- EFTER-tjek (kør og gem CSV):
select '1 funktion' as sektion, p.proname as noegle,
       concat(case when p.prosecdef then 'definer' else 'invoker' end, ' | ', array_to_string(p.proconfig, ' ')) as vaerdi
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('event_svar_grupper', 'get_event_svaroversigt')
union all
select '2 grants', r.routine_name || ' → ' || coalesce(r.grantee, '(ingen)'), coalesce(r.privilege_type, '')
  from information_schema.routine_privileges r
 where r.specific_schema = 'public' and r.routine_name in ('event_svar_grupper', 'get_event_svaroversigt')
union all
select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
order by 1, 2;
-- FACIT EFTER: 1 = to rækker, begge «definer | search_path=public»; 2 = event_svar_grupper → service_role;
--   get_event_svaroversigt → authenticated + service_role (postgres-ejeren står også).
