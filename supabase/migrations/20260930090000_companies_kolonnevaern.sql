-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- Kolonneværnet på companies (sikkerhedsanalysen 29/9-2026, fund 1 og fund 7).
-- Rækkefølgen: (1) FØR-SELECT nederst → skriv værdierne i bogføringen. (2) Kør denne fils
-- SQL-krop (alt under «KROPPEN»). (3) EFTER-SELECT (samme forespørgsel). (4) Bevis-kørslen.
-- Ingen frontend- eller function-ændring afhænger af migrationen; Update kan klikkes før og efter.
--
-- ── FUND 1 (KRITISK) ────────────────────────────────────────────────────────────────
-- «Members can update own company» (20260224222456:51-53) er en rækkepolicy uden
-- kolonnebegrænsning, og der findes ingen trigger og ingen kolonne-GRANT på companies
-- (målt i migrationerne 29/9; prod UMÅLT — FØR-SELECT sektion 1). Et medlem kan derfor med
-- én supabase.from("companies").update(...) fra browserkonsollen sætte contract_end_date,
-- is_legat, *_session_used_at, prisfelterne, stripe_customer_id, status, er_kunde …
-- Kolonne-GRANTs duer ikke: rådgivere bruger samme rolle (authenticated) og skal kunne skrive alt.
--
-- Rettelsen: en BEFORE UPDATE-trigger med en HVIDLISTE. Når kalderen er et medlem (JWT-rolle
-- eller current_user = authenticated/anon) og ikke rådgiver/admin, må intet uden for
-- hvidlisten ændre værdi. Fail-closed: en ny kolonne er beskyttet, til nogen bevidst åbner den.
--
-- HVIDLISTEN er MÅLT i src/ 29/9 (alle .from("companies").update(...) på medlemsstier):
--   IndstillingerView.tsx:227/238 logo_url · :262 name, cvr_number, contact_email, website,
--     contact_phone, industry_code, industry_label · :364 weekly_focus_enabled
--   lib/delingsbilleder.ts:144 logo_url (DelingView)
--   MembershipExpiredGate.tsx:154/176 offboarding_requested_at
--   hooks/useAuth.tsx:247 onboarding_completed
--   lib/hjemmebane/memberProfile.ts:116 description
-- Rådgiverstier (urørte af værnet, has_role 'advisor' — admin arver): EditCompanyDialog.tsx:131
-- (kontrakt, sessioner, vis_i_netvaerk …), hooks/useVirksomhed.ts:590/602/614.
-- Service-role-stier (urørte, JWT-rolle service_role): stripe-webhook, opret-fornyelse-checkout,
-- create-subscription-checkout, _shared/indgangsFaktura, create-free-intro-booking,
-- calendly-webhook, intro-reminder-cron, slet-medlemsdata-cron, monday-webhook,
-- create-legat-enrollment, upgrade-legat-to-member, import-application, run-company-agent,
-- berig-virksomheder — alle med service-role-klienten (målt 29/9).
-- SQL editor / pg_cron (postgres, ingen JWT): urørt — dataretninger som 20260929195000 virker.
-- Ingen SECURITY DEFINER-funktion i migrationerne skriver companies (målt 29/9).
-- Kildeværn: src/lib/__tests__/companiesKolonnevaern.guard.test.ts holder hvidlisten her og
-- medlemsstierne i src/ i takt, og fælder hvis en forbudt kolonne kommer på listen.
--
-- ÅBENT (ikke rettet her, bevidst): name og cvr_number ER medlemsskrevne (Indstillinger) og
-- står derfor på hvidlisten. Analysens A4 (virksomhedsnavnet i invitationsmailen) og
-- CVR-genbrugskæden ved ansøgerens underskrift er dermed ikke lukket af dette værn.
--
-- ── FUND 7 (MELLEM) ─────────────────────────────────────────────────────────────────
-- DROP POLICY «Members can insert own notifications» ON advisor_notifications.
-- Begrundelse (CLAUDE.md kræver den): policyen (20260226070339:5-8) lader ethvert medlem
-- indsætte en rådgiverklokke med fri type/advisor_id/title/body — klokke-mail-cron mailer
-- rækker med advisor_id, ALARM-typer straks til driftModtager(). INGEN klient bruger den
-- (målt 29/9): eneste klient-insert var src/lib/advisorNotifications.ts:createAdvisorNotification,
-- som ingen kalder (grep i src/ og supabase/) — filen slettes i samme PR. Alle skrivere er
-- edge functions med service role, som RLS ikke rammer. Rådgivernes SELECT/UPDATE/DELETE røres ikke.
--
-- ── FUND 6 (MELLEM) — IKKE RETTET, ÅBENT ────────────────────────────────────────────
-- «Users can insert own reports/milestones/kpi targets/benchmarks» tjekker kun user_id.
-- En WITH CHECK på company_id = user_company_id(auth.uid()) kan IKKE verificeres fra koden:
-- user_company_id tager én vilkårlig række (LIMIT 1), og company_members har ingen unik
-- nøgle på user_id i migrationerne — et medlem i to virksomheder ville miste skriveadgangen
-- til den ene. FØR-SELECT sektion 5–6 måler det; stramningen skrives, når tallene er læst.
--
-- ═══ FØR-SELECT og EFTER-SELECT (samme forespørgsel, ét resultatsæt) ════════════════
-- Lovable SQL editor
/*
select * from (
  select '1_triggere_companies' as sektion,
         coalesce((select string_agg(t.tgname::text, ', ' order by t.tgname)
                   from pg_trigger t
                   where t.tgrelid = 'public.companies'::regclass and not t.tgisinternal), 'ingen') as vaerdi
  union all
  select '2_funktion_companies_medlem_kolonnevaern',
         coalesce((select 'findes · security_definer=' || p.prosecdef
                          || ' · ' || coalesce(array_to_string(p.proconfig, ','), 'INTET search_path')
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'companies_medlem_kolonnevaern'), 'findes ikke')
  union all
  select '3_advisor_notifications_insert_policies',
         coalesce((select string_agg(policyname || ' | roles=' || array_to_string(roles, ',')
                                     || ' | check=' || coalesce(with_check, ''), ' ; ')
                   from pg_policies
                   where schemaname = 'public' and tablename = 'advisor_notifications' and cmd = 'INSERT'),
                  'ingen INSERT-policy')
  union all
  select '4_companies_update_policies',
         coalesce((select string_agg(policyname || ' | using=' || coalesce(qual, '')
                                     || ' | check=' || coalesce(with_check, ''), ' ; ' order by policyname)
                   from pg_policies
                   where schemaname = 'public' and tablename = 'companies' and cmd in ('UPDATE', 'ALL')), 'ingen')
  union all
  select '5_fund6_brugere_i_flere_virksomheder',
         (select count(*)::text from (select user_id from public.company_members
                                      group by user_id having count(distinct company_id) > 1) x)
  union all
  select '6_fund6_raekker_uden_for_skribentens_virksomhed',
         (select 'financial_reports=' || count(*) from public.financial_reports r
           where r.company_id is distinct from public.user_company_id(r.user_id)
             and not public.has_role(r.user_id, 'advisor'::app_role))
         || ' · ' ||
         (select 'milestones=' || count(*) from public.milestones r
           where r.company_id is distinct from public.user_company_id(r.user_id)
             and not public.has_role(r.user_id, 'advisor'::app_role))
         || ' · ' ||
         (select 'kpi_targets=' || count(*) from public.kpi_targets r
           where r.company_id is distinct from public.user_company_id(r.user_id)
             and not public.has_role(r.user_id, 'advisor'::app_role))
         || ' · ' ||
         (select 'kpi_benchmarks=' || count(*) from public.kpi_benchmarks r
           where r.company_id is distinct from public.user_company_id(r.user_id)
             and not public.has_role(r.user_id, 'advisor'::app_role))
  union all
  select '7_funktioner_der_skriver_companies',
         (select coalesce(string_agg(p.proname || ' · definer=' || p.prosecdef, ', '), 'ingen')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc ~* 'update\s+(public\.)?companies\M')
) samlet
order by sektion;
*/
-- Forventet FØR: 1 «ingen» (en række = prod har noget, repoet ikke kender → STOP og bogfør) ·
--   2 «findes ikke» · 3 «Members can insert own notifications | roles=authenticated |
--   check=(member_id = auth.uid())» · 4 de to policies (Advisors … / Members …) · 5–6 tal ·
--   7 «ingen» (Forventet FØR: ingen, ellers STOP og bogfør — en funktion, der skriver companies, kan blive ramt af værnet).
-- Forventet EFTER: 1 «companies_medlem_kolonnevaern» · 2 «findes · security_definer=false ·
--   search_path=public» · 3 «ingen INSERT-policy» · 4, 5, 6, 7 uændrede.
--
-- ═══ BEVIS-KØRSLEN (efter EFTER-SELECT; ændrer intet — hvert trin rulles tilbage) ═══
-- Som testmedlemmet kontakt@topix.dk (Topix.dk ApS), som en rådgiver, som service_role og som
-- postgres. Hvert trin kører i en undertransaktion, der ALTID ender med en exception og
-- derfor rulles tilbage — også hvis værnet svigter og skrivningen går igennem.
-- Lovable SQL editor
/*
drop table if exists pg_temp.kolonnevaern_bevis;
create temp table kolonnevaern_bevis (nr int, trin text, forventet text, udfald text, dom text);
do $bevis$
declare
  medlem uuid;
  raadgiver uuid;
  virksomhed uuid;
  claims_medlem text;
  claims_raadgiver text;
  n bigint;
  udfald text;
  trin text[] := array[
    'medlem: contract_end_date +1 dag',
    'medlem: is_legat vendt',
    'medlem: intro_session_used_at nulstillet/sat',
    'medlem: stripe_customer_id',
    'medlem: hvidlistet (weekly_focus_enabled vendt + description)',
    'medlem: hvidlistet + contract_end_date i samme UPDATE',
    'rådgiver: contract_end_date +1 dag',
    'service_role: contract_end_date +1 dag',
    'postgres uden JWT (SQL editor): contract_end_date +1 dag'];
  forventet text[] := array['afvist','afvist','afvist','afvist','1 række','afvist','1 række','1 række','1 række'];
  sqls text[] := array[
    'update public.companies set contract_end_date = coalesce(contract_end_date, current_date) + 1 where id = $1',
    'update public.companies set is_legat = true where id = $1',
    'update public.companies set intro_session_used_at = case when intro_session_used_at is null then now() else null end where id = $1',
    'update public.companies set stripe_customer_id = ''cus_bevis'' where id = $1',
    'update public.companies set weekly_focus_enabled = not weekly_focus_enabled, description = coalesce(description, '''') || '' '' where id = $1',
    'update public.companies set weekly_focus_enabled = not weekly_focus_enabled, contract_end_date = coalesce(contract_end_date, current_date) + 1 where id = $1',
    'update public.companies set contract_end_date = coalesce(contract_end_date, current_date) + 1 where id = $1',
    'update public.companies set contract_end_date = coalesce(contract_end_date, current_date) + 1 where id = $1',
    'update public.companies set contract_end_date = coalesce(contract_end_date, current_date) + 1 where id = $1'];
  roller text[] := array['authenticated','authenticated','authenticated','authenticated','authenticated','authenticated','authenticated','service_role',null];
  claims text[];
begin
  select u.id into medlem from auth.users u where lower(u.email) = 'kontakt@topix.dk';
  select ur.user_id into raadgiver from public.user_roles ur where ur.role::text in ('advisor', 'admin') limit 1;
  virksomhed := public.user_company_id(medlem);
  if medlem is null or virksomhed is null or raadgiver is null or public.has_role(medlem, 'advisor'::app_role) then
    insert into kolonnevaern_bevis values (0, 'forudsætning', 'medlem uden rådgiverrolle, med virksomhed; en rådgiver',
      'medlem=' || coalesce(medlem::text, 'MANGLER') || ' virksomhed=' || coalesce(virksomhed::text, 'MANGLER')
      || ' rådgiver=' || coalesce(raadgiver::text, 'MANGLER') || ' medlem_er_raadgiver=' || coalesce(public.has_role(medlem, 'advisor'::app_role)::text, '?'),
      'STOP');
    return;
  end if;
  claims_medlem := json_build_object('sub', medlem, 'role', 'authenticated')::text;
  claims_raadgiver := json_build_object('sub', raadgiver, 'role', 'authenticated')::text;
  claims := array[claims_medlem, claims_medlem, claims_medlem, claims_medlem, claims_medlem, claims_medlem,
                  claims_raadgiver, '{"role":"service_role"}', '{}'];
  for i in 1 .. array_length(trin, 1) loop
    udfald := null;
    begin
      perform set_config('request.jwt.claims', claims[i], true);
      if roller[i] is not null then
        execute format('set local role %I', roller[i]);
      end if;
      execute sqls[i] using virksomhed;
      get diagnostics n = row_count;
      udfald := n || ' række';
      raise exception using errcode = 'P0001', message = 'bevis_rul_tilbage';
    exception
      when insufficient_privilege then udfald := 'afvist: ' || sqlerrm;
      when others then
        if sqlerrm <> 'bevis_rul_tilbage' then udfald := 'FEJL ' || sqlstate || ': ' || sqlerrm; end if;
    end;
    insert into kolonnevaern_bevis values (i, trin[i], forventet[i], udfald,
      case when forventet[i] = 'afvist' and udfald like 'afvist: Medlemmer må ikke%' then 'OK'
           when forventet[i] = '1 række' and udfald = '1 række' then 'OK'
           else 'FEJL' end);
  end loop;
end
$bevis$;
select * from kolonnevaern_bevis order by nr;
*/
-- Forventet: ni rækker, alle «OK». Trin 1–4 og 6: «afvist: Medlemmer må ikke ændre disse felter på
-- virksomheden: <kolonne>». Trin 5, 7, 8, 9: «1 række». En række med «STOP» = testmedlemmet eller
-- en rådgiver findes ikke (eller testmedlemmet har en rådgiverrolle) — intet er prøvet.

-- ═══ KROPPEN ═══════════════════════════════════════════════════════════════════════

create or replace function public.companies_medlem_kolonnevaern()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- HVIDLISTEN: de kolonner, et medlem må ændre på sin egen virksomhed. Målt i src/ 29/9
  -- (filhovedet). Holdes i takt med src/ af companiesKolonnevaern.guard.test.ts.
  tilladte constant text[] := array[
    'name',
    'cvr_number',
    'contact_email',
    'website',
    'contact_phone',
    'industry_code',
    'industry_label',
    'logo_url',
    'weekly_focus_enabled',
    'description',
    'offboarding_requested_at',
    'onboarding_completed'
  ];
  jwt_rolle text := coalesce(auth.role(), '');
  aendrede text;
begin
  -- Kun klientkald bedømmes: PostgREST som authenticated/anon, ELLER en JWT med den rolle
  -- (også gennem en SECURITY DEFINER-funktion, hvor current_user er ejeren). service_role
  -- og postgres uden JWT (SQL editor, migrationer, pg_cron) passerer.
  if current_user::text not in ('authenticated', 'anon') and jwt_rolle not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Rådgivere skriver alt (EditCompanyDialog); has_role giver også admin.
  if public.has_role(auth.uid(), 'advisor'::app_role) then
    return new;
  end if;

  if (to_jsonb(new) - tilladte) is not distinct from (to_jsonb(old) - tilladte) then
    return new;
  end if;

  select string_agg(n.key, ', ' order by n.key)
    into aendrede
    from jsonb_each(to_jsonb(new) - tilladte) n
   where n.value is distinct from (to_jsonb(old) -> n.key);

  raise exception 'Medlemmer må ikke ændre disse felter på virksomheden: %', aendrede
    using errcode = '42501',
          hint = 'Kolonneværnet på companies (migration 20260930090000): kun hvidlistede felter er medlemsskrivbare.';
end;
$$;

comment on function public.companies_medlem_kolonnevaern() is
  'BEFORE UPDATE på companies: et medlem (ikke rådgiver/admin, ikke service_role) må kun ændre hvidlistede kolonner. Sikkerhedsanalysen 29/9-2026 fund 1, migration 20260930090000.';

drop trigger if exists companies_medlem_kolonnevaern on public.companies;
create trigger companies_medlem_kolonnevaern
  before update on public.companies
  for each row execute function public.companies_medlem_kolonnevaern();

-- Fund 7 — begrundelsen står i filhovedet: ingen klientskriver (målt 29/9), og policyen lod
-- ethvert medlem lægge fri tekst i rådgivernes klokker og driftsalarmens mail.
drop policy if exists "Members can insert own notifications" on public.advisor_notifications;
