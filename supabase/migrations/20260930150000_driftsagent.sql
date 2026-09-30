-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- DRIFTSAGENTEN, skive 1 (30/9-2026; Jonas: «den overvåger cron-jobs, fejl,
-- mailudsendelser og svartider og skriver til dig, før noget går galt»).
-- Grundlaget er ~/analyse-drift.md (docs/analyser-30-09/analyse-drift.md).
-- KUN TILFØJENDE: to nye tabeller, én ny nøgle i app_config, to nye funktioner.
-- Ingen eksisterende funktion, tabel, politik eller SECURITY DEFINER røres.
--
-- RÆKKEFØLGEN — HVER FIL FOR SIG, ALDRIG I EN SAMLET KØRSEL (docs/OVERLEVERING.md
-- DEL 3 «Driftsagenten, skive 1 — rækkefølgen»; CLAUDE.md «Deployment af edge functions»):
--   1. DENNE migration (FØR-SQL → kørsel → EFTER-SQL).
--   2. 20260930151000_driftsagent_rettigheder.sql — KRÆVER JONAS' GRØNNE LYS (den
--      gør drift_agent_laes() til SECURITY DEFINER). Uden den læser agenten som
--      service_role og svarer med et RØDT «kan ikke læse»-fund.
--   3. merge → EKSPLICIT deploy af drift-agent-cron fra build-chat (bed den KØRE
--      deploy-værktøjet og vise resultatet).
--   4. Tørkørsel i hånden: SELECT public.kald_edge('drift-agent-cron', '{}'::jsonb, 60000);
--      og svaret: SELECT id, status_code, left(content, 3000) FROM net._http_response ORDER BY id DESC LIMIT 1;
--      Beviset: "drift_agent":"skive-1" i svaret, «tal.jobs» > 0 og «laesefejl» tom.
--   5. FØRST DA 20260930152000_driftsagent_cron.sql (cron-jobbet) — dens FØRSTE
--      linje er med vilje en anden, så den ikke tages med i en scanning efter
--      «IKKE KØRT».
--   6. Låsen åbnes separat, når svaret er læst (se «LÅSEN»).
--
-- ── HVAD DER OPRETTES ───────────────────────────────────────────────────────
-- (a) app_config['driftsagent_aktiv'] = false — LÅSEN. Fail-closed: ikke sat =
--     false. Uden den mailer agenten ALDRIG, heller ikke med dry_run: false —
--     den dømmer og logger kun. Skrives eksplicit som false her (ikke «ikke sat»),
--     fordi en lås, man ikke kan se, bliver glemt (lærestreg 22/9). Åbnes med:
--       UPDATE public.app_config SET config_value = 'true'::jsonb, updated_at = now()
--        WHERE config_key = 'driftsagent_aktiv' AND config_value = 'false'::jsonb;
--
-- (b) drift_agent_koersler — agentens egen log: én række pr. RIGTIG kørsel
--     (dry_run false; tørkørsler skriver intet). Agenten læser sin forrige række
--     i hver kørsel («vagt for sig selv»: sprang den over? kunne alarmmailen ikke
--     sendes?). aftryk = de røde fund, så samme røde billede kun mailes én gang
--     om dagen. Ryddes af functionen efter 30 dage (96 rækker/døgn).
--     SERVICE-ROLE-ONLY: RLS slået til UDEN politikker (som ansoegning_visninger).
--
-- (c) drift_agent_jobs — hvornår agenten FØRST så hvert cron-job. Et job, der er
--     yngre end sin seneste forventede fyring, dømmes ikke «stille» (ellers giver
--     et nyt døgnjob, planlagt kl. 18:46 med skema 06:15, en falsk alarm hele
--     natten). Service-role-only som (b). FYLDES HER med alle nuværende jobs
--     (foerst_set = nu, teknisk råd 30/9 fund 6): en tom tabel ville functionen
--     læse som «ukendt» og dømme ALLE jobs som kendte — også et job, der blev
--     planlagt for en time siden. Indsættelsen kører som postgres i SQL editor —
--     samme rolle og vej som vagt_cron læser cron.job med (SECURITY DEFINER,
--     ejet af postgres).
--
-- (d) public.drift_agent_kerne(text) — tager KUN kernefelterne ud af et
--     HTTP-svars krop (tal og sandhedsværdier; ordlisten er driftDom.ts
--     KERNE_FELTER, driftDom.guard holder dem i takt). Aldrig tekst: en krop kan
--     bære navne og mails. IMMUTABLE, SECURITY INVOKER.
--
-- (e) public.drift_agent_laes() — agentens ENESTE læsning af cron og net.
--     OPRETTES HER SECURITY INVOKER (kører som kalderen, service_role — denne fil
--     skaber ingen SECURITY DEFINER). 20260930151000 (kræver Jonas' grønne lys)
--     gør den til SECURITY DEFINER med search_path = public, pg_temp — i stedet
--     for at give service_role USAGE på skemaet cron (teknisk råd 30/9 fund 1:
--     USAGE på cron åbner også cron.schedule/unschedule, hvis EXECUTE står til
--     PUBLIC). STABLE, kun SELECT. Hver sektion i sin egen BEGIN/EXCEPTION, så en
--     sektion, der ikke kan læses, bliver en linje i «fejl» (og et rødt fund i
--     dommen) i stedet for at vælte de andre. Læser:
--       cron.job                 alle jobs: navn, skema, active, mål (funktionsnavnet
--                                i kald_edge('…') / …/functions/v1/…), timeout.
--                                KOMMANDOEN returneres IKKE.
--       cron.job_run_details     de seneste 3000 gennem PRIMÆRNØGLEN (runid DESC —
--                                vagtens metode, 10/9: start_time har intet indeks),
--                                filtreret til 25 t i hukommelsen. ~80 kørsler/t ×
--                                25 t = 2000 < 3000; rammes loftet inden for 25 t,
--                                står det i koersler_loft_ramt, og dommen dømmer kun
--                                inden for det læste. return_message kun for failed.
--       net._http_response      25 t (pg_net rydder selv, standard 6 t): status,
--                                timeout, transportfejl, og kernen for 200-svar.
--       spor                     antal pr. udfald, seneste time og de foregående 23
--                                timer: webinar_mails, klaviyo_haendelser,
--                                klaviyo_profil, meta_haendelser, ga_haendelser,
--                                email_send_log (status). Ingen rækker, kun tal.
--       cron_vagt_log            vagtens seneste række (tid, dom, grunde).
--
-- ── RETTIGHEDERNE (UMÅLT — derfor FØR-SQL'ens sektion 4) ────────────────────
-- En SECURITY INVOKER-funktion kan kun læse det, service_role må. Ingen migration
-- i repoet giver service_role adgang til skemaerne cron eller net (grep 30/9), og
-- cron.job har RLS (username = current_user). Vejen er IKKE en GRANT på skemaet
-- cron (den første udgave af 20260930151000 gjorde det — teknisk råd 30/9 fund 1:
-- USAGE på cron giver også adgang til cron.schedule/unschedule, hvis EXECUTE står
-- til PUBLIC, og det er skriveret). Vejen er vagtens: læseren køres som postgres
-- (SECURITY DEFINER, 20260930151000, kræver Jonas' grønne lys). Sektion 4 måler
-- udgangspunktet, så EFTER kan vise, at intet i cron er ændret. Uden 151000
-- svarer agenten med et RØDT fund («kan ikke læse cron.job …» / «ser 0
-- cron-jobs») — den tier ikke.
--
-- ── FØR-SQL (ét resultatsæt — gem CSV) ──────────────────────────────────────
--   select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables
--    where table_schema = 'public' and table_name in ('drift_agent_koersler', 'drift_agent_jobs')
--   union all
--   select '2 funktioner', p.proname, concat('prosecdef=', p.prosecdef)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('drift_agent_laes', 'drift_agent_kerne')
--   union all
--   select '3 laasen', 'driftsagent_aktiv',
--          coalesce((select config_value::text from public.app_config where config_key = 'driftsagent_aktiv'), 'ikke sat → false')
--   union all
--   select '4 rettigheder', x.hvad, x.svar::text from (values
--     ('service_role rolbypassrls', (select rolbypassrls from pg_roles where rolname = 'service_role')),
--     ('USAGE schema cron',         has_schema_privilege('service_role', 'cron', 'USAGE')),
--     ('EXECUTE cron.schedule',     has_function_privilege('service_role', 'cron.schedule(text,text,text)', 'EXECUTE')),
--     ('EXECUTE cron.unschedule',   has_function_privilege('service_role', 'cron.unschedule(text)', 'EXECUTE')),
--     ('SELECT cron.job',           has_table_privilege('service_role', 'cron.job', 'SELECT')),
--     ('SELECT cron.job_run_details', has_table_privilege('service_role', 'cron.job_run_details', 'SELECT')),
--     ('USAGE schema net',          has_schema_privilege('service_role', 'net', 'USAGE')),
--     ('SELECT net._http_response', has_table_privilege('service_role', 'net._http_response', 'SELECT')),
--     ('SELECT public.cron_vagt_log', has_table_privilege('service_role', 'public.cron_vagt_log', 'SELECT'))
--   ) x(hvad, svar)
--   union all
--   select '5 cron.job', j.jobname, concat(j.schedule, ' · active=', j.active) from cron.job j
--    where j.jobname in ('drift-agent', 'vagt-cron')
--   union all
--   -- Kørsler de seneste 25 t mod læserens loft (3000, teknisk råd 30/9 fund 4):
--   -- er tallet over 3000, rammer drift_agent_laes loftet, og agenten melder gult
--   -- «koersler_loft_ramt» i hver kørsel — hæv v_koersler_loft FØR migrationen køres.
--   select '6 koersler 25 t', 'antal (loft 3000)', count(*)::text
--     from cron.job_run_details where start_time > now() - interval '25 hours'
--   order by 1, 2;
--   FACIT FØR: sektion 1, 2 TOMME; sektion 3 «ikke sat → false»; sektion 4 = SVARET
--   PÅ DET UMÅLTE (skriv det ind her — «USAGE schema cron» og «EXECUTE
--   cron.schedule» skal stå ENS i 151000's EFTER); sektion 5 = kun vagt-cron;
--   sektion 6 = et tal under 3000 (ellers STOP og hæv loftet).
--   FØR (indsættes her): [ikke målt endnu]
--
-- ── EFTER-SQL: nederst i filen (kør med det samme, gem CSV) ────────────────
--   FACIT EFTER: sektion 1 = 2 tabeller; sektion 2 = 2 funktioner med
--   prosecdef=false; sektion 3 = false; sektion 4 = ingen politikker (RLS uden
--   politikker); sektion 5 = en linje med «jobs=N» (N > 0 — kaldt som postgres) og
--   «fejl=» tom; sektion 6 = drift_agent_jobs har lige så mange rækker som cron.job.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop function if exists public.drift_agent_laes();
--   drop function if exists public.drift_agent_kerne(text);
--   drop table if exists public.drift_agent_koersler;
--   drop table if exists public.drift_agent_jobs;
--   delete from public.app_config where config_key = 'driftsagent_aktiv';

-- ── (a) Låsen ────────────────────────────────────────────────────────────────
insert into public.app_config (config_key, config_value, description)
values ('driftsagent_aktiv', 'false'::jsonb, 'Driftsagenten (drift-agent-cron, 30/9-2026): mailer den driftModtager ved rødt? false = den dømmer og logger kun (standard). true sættes med én SQL, når en tørkørsel er læst.')
on conflict (config_key) do nothing;

-- ── (b) Agentens egen log ────────────────────────────────────────────────────
create table if not exists public.drift_agent_koersler (
  id            bigserial primary key,
  tid           timestamptz not null default now(),
  laas_aktiv    boolean not null,
  alvor         text not null,
  roede         integer not null default 0,
  gule          integer not null default 0,
  -- De røde fund som «kode:emne», sorteret, samlet med «|» (driftDom.driftAftryk).
  aftryk        text not null default '',
  -- Fundene som svaret bar dem: kode · alvor · emne · saetning (ingen persondata).
  fund          jsonb not null default '[]'::jsonb,
  tal           jsonb,
  laesefejl     text[] not null default '{}',
  -- mail · ikke_roed · sender_ikke · fandtes_denne_time · samme_billede_i_dag
  alarm_valg    text not null default 'ingen',
  -- ingen · sendt · fejlet: …
  alarm_mail    text not null default 'ingen',
  alarm_klokke  text not null default 'ingen',
  -- Den gule opsamling kl. 07 på hverdage (fund 5): ingen · sendt · fejlet: …
  gul_mail      text not null default 'ingen',
  varighed_ms   integer,
  constraint drift_agent_koersler_alvor_check check (alvor in ('groen', 'gul', 'roed'))
);

create index if not exists drift_agent_koersler_tid_idx on public.drift_agent_koersler (tid desc);

comment on table public.drift_agent_koersler is
  'Driftsagentens egen log (30/9-2026, skive 1): én række pr. RIGTIG kørsel af drift-agent-cron. Agenten læser sin forrige række i hver kørsel (vagt for sig selv). aftryk = de røde fund; samme aftryk mailes højst én gang pr. dansk dag. Service-role-only (RLS uden politikker). Ryddes efter 30 dage af functionen.';

alter table public.drift_agent_koersler enable row level security;

-- ── (c) Hvornår agenten først så hvert job ──────────────────────────────────
create table if not exists public.drift_agent_jobs (
  jobid       bigint primary key,
  jobname     text not null,
  foerst_set  timestamptz not null default now()
);

comment on table public.drift_agent_jobs is
  'Driftsagenten (30/9-2026): hvornår agenten første gang så hvert cron-job (cron.job.jobid). Et job, der er yngre end sin seneste forventede fyring, dømmes ikke stille. Kun indsat (on conflict do nothing) af drift-agent-cron i en rigtig kørsel. Service-role-only (RLS uden politikker).';

alter table public.drift_agent_jobs enable row level security;

-- Fyldes med de jobs, der findes NU (fund 6). Kører som postgres i SQL editor —
-- vagtens vej til cron.job. Et job, der er planlagt før denne linje, men hvis
-- seneste forventede fyring ligger efter, dømmes normalt; et, hvis fyring ligger
-- før, er «nyt» indtil sin næste fyring (driftDom: foerst_set > forventet).
insert into public.drift_agent_jobs (jobid, jobname, foerst_set)
select j.jobid, j.jobname, now()
  from cron.job j
on conflict (jobid) do nothing;

-- ── (d) Kernen af et svar ────────────────────────────────────────────────────
-- Tager KUN disse felter (driftDom.ts KERNE_FELTER): ok · dry_run · fejlede ·
-- fejlet · fejl · faktura_i_haanden · over_loft · udsat · ventende · drift_agent ·
-- error · errors.
--   error              tal → tallet; liste → længden; objekt → 1; ikke-tom tekst → 1
--   errors             tal → tallet; liste → længden; objekt → 1
--                      (fund 8: functions, der svarer 200 med {"error": …} eller {"errors": [...]})
--   fejl               tal → tallet; liste → længden; tekst → 1 (500-svarets «fejl: grund»)
--   faktura_i_haanden  liste → længden
--   ventende           de DISTINKTE {art, session_tid} — ingen mails
-- Alt andet i kroppen ignoreres. En krop, der ikke er et JSON-objekt → null;
-- en, der ligner JSON men ikke kan læses → {"ulaeselig": true}.
create or replace function public.drift_agent_kerne(p_indhold text)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  j jsonb;
begin
  if p_indhold is null or p_indhold !~ '^\s*\{' then
    return null;
  end if;
  begin
    j := p_indhold::jsonb;
  exception when others then
    return jsonb_build_object('ulaeselig', true);
  end;
  if jsonb_typeof(j) <> 'object' then
    return null;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'ok',                case when jsonb_typeof(j->'ok') = 'boolean' then j->'ok' end,
    'dry_run',           case when jsonb_typeof(j->'dry_run') = 'boolean' then j->'dry_run' end,
    'fejlede',           case when jsonb_typeof(j->'fejlede') = 'number' then j->'fejlede' end,
    'fejlet',            case when jsonb_typeof(j->'fejlet') = 'number' then j->'fejlet' end,
    'fejl',              case jsonb_typeof(j->'fejl')
                           when 'number' then j->'fejl'
                           when 'array'  then to_jsonb(jsonb_array_length(j->'fejl'))
                           when 'string' then to_jsonb(1)
                         end,
    'faktura_i_haanden', case when jsonb_typeof(j->'faktura_i_haanden') = 'array' then to_jsonb(jsonb_array_length(j->'faktura_i_haanden')) end,
    'over_loft',         case when jsonb_typeof(j->'over_loft') = 'number' then j->'over_loft' end,
    'udsat',             case when jsonb_typeof(j->'udsat') = 'number' then j->'udsat' end,
    'ventende',          case when jsonb_typeof(j->'ventende') = 'array' then
                           (select jsonb_agg(distinct jsonb_build_object('art', v->>'art', 'session_tid', v->>'session_tid'))
                              from jsonb_array_elements(j->'ventende') v)
                         end,
    'drift_agent',       case when jsonb_typeof(j->'drift_agent') = 'string' then j->'drift_agent' end,
    'error',             case jsonb_typeof(j->'error')
                           when 'number' then j->'error'
                           when 'array'  then to_jsonb(jsonb_array_length(j->'error'))
                           when 'object' then to_jsonb(1)
                           when 'string' then case when length(j->>'error') > 0 then to_jsonb(1) end
                         end,
    'errors',            case jsonb_typeof(j->'errors')
                           when 'number' then j->'errors'
                           when 'array'  then to_jsonb(jsonb_array_length(j->'errors'))
                           when 'object' then to_jsonb(1)
                         end
  ));
end;
$$;

revoke all on function public.drift_agent_kerne(text) from public, anon, authenticated;
grant execute on function public.drift_agent_kerne(text) to service_role;

comment on function public.drift_agent_kerne(text) is
  'Driftsagenten (30/9-2026): kernefelterne af et HTTP-svars krop — tal og sandhedsværdier, aldrig tekst. Ordlisten er driftDom.ts KERNE_FELTER.';

-- ── (e) Læsningen ────────────────────────────────────────────────────────────
create or replace function public.drift_agent_laes()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  -- De seneste N kørsler gennem primærnøglen (vagtens metode, 10/9). ~80/t × 25 t = 2000.
  v_koersler_loft constant integer := 3000;
  v_jobs jsonb := '[]'::jsonb;
  v_koersler jsonb := '[]'::jsonb;
  v_loft_ramt boolean := false;
  v_aeldste timestamptz;
  v_svar jsonb := '[]'::jsonb;
  v_spor jsonb := '[]'::jsonb;
  v_del jsonb;
  v_s record;
  v_vagt jsonb;
  v_fejl text[] := '{}';
begin
  -- cron.job — mål og timeout udledes af kommandoen; kommandoen selv returneres ikke.
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'jobid', j.jobid,
             'jobname', j.jobname,
             'schedule', j.schedule,
             'active', j.active,
             'maal', coalesce(substring(j.command from $r$kald_edge\(\s*'([a-z0-9-]+)'$r$),
                              substring(j.command from 'functions/v1/([a-z0-9-]+)')),
             'kald_edge', j.command ~ 'kald_edge\(',
             'http_post', j.command ~ 'net\.http_post',
             -- Eksplicit timeout: kald_edges tredje argument, eller net.http_posts
             -- timeout_milliseconds. null = standarden (driftDom.jobTimeoutMs).
             'timeout_ms', case
                             when j.command ~ 'kald_edge\(' then substring(j.command from $r$'::jsonb\s*,\s*(\d+)$r$)::integer
                             when j.command ~ 'timeout_milliseconds' then substring(j.command from 'timeout_milliseconds\s*:=\s*(\d+)')::integer
                           end
           ) order by j.jobid), '[]'::jsonb)
      into v_jobs
      from cron.job j;
  exception when others then
    v_fejl := array_append(v_fejl, 'cron.job: ' || sqlerrm);
  end;

  -- cron.job_run_details — de seneste N gennem runid, DEREFTER 25 t i hukommelsen.
  begin
    with seneste as (
      select d.runid, d.jobid, d.status, d.start_time, d.end_time, d.return_message
        from cron.job_run_details d
       order by d.runid desc
       limit v_koersler_loft
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'runid', s.runid,
             'jobid', s.jobid,
             'status', s.status,
             'start', s.start_time,
             'slut', s.end_time,
             'besked', case when s.status = 'failed' then left(s.return_message, 160) end
           ) order by s.runid) filter (where s.start_time > now() - interval '25 hours'), '[]'::jsonb),
           count(*) = v_koersler_loft and min(s.start_time) > now() - interval '25 hours',
           min(s.start_time)
      into v_koersler, v_loft_ramt, v_aeldste
      from seneste s;
  exception when others then
    v_fejl := array_append(v_fejl, 'cron.job_run_details: ' || sqlerrm);
  end;

  -- net._http_response — status og kernen; aldrig kroppen.
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id,
             'status', r.status_code,
             'timeout', (coalesce(r.timed_out, false) or coalesce(r.error_msg, '') ~* '(timeout|timed out)'),
             'transportfejl', (r.status_code is null and r.error_msg is not null),
             'created', r.created,
             'kerne', case when r.status_code = 200 then public.drift_agent_kerne(r.content) end
           ) order by r.id), '[]'::jsonb)
      into v_svar
      from net._http_response r
     where r.created > now() - interval '25 hours';
  exception when others then
    v_fejl := array_append(v_fejl, 'net._http_response: ' || sqlerrm);
  end;

  -- Sporene — antal pr. udfald: seneste time (time = true) og de foregående 23
  -- timer. ÉN BLOK PR. SPOR: en tabel eller kolonne, der ikke findes, bliver én
  -- linje i «fejl» og vælter ikke de andre. Listen (spor, tidskolonne,
  -- udfaldskolonne) er driftDom.ts SPOR — driftDom.guard holder dem i takt.
  for v_s in
    select * from (values
      ('webinar_mails',      'forsoegt_at',       'udfald'),
      ('klaviyo_haendelser', 'sendt_at',          'udfald'),
      ('klaviyo_profil',     'forsoegt_at',       'udfald'),
      ('meta_haendelser',    'sidste_forsoeg_at', 'udfald'),
      ('ga_haendelser',      'sidste_forsoeg_at', 'udfald'),
      ('email_send_log',     'created_at',        'status')
    ) as t(spor, tid, udfald)
  loop
    begin
      execute format(
        'select coalesce(jsonb_agg(jsonb_build_object(''spor'', %L, ''time'', x.i_timen, ''udfald'', x.udfald, ''n'', x.n)), ''[]''::jsonb)
           from (select (%I > now() - interval ''1 hour'') as i_timen, %I::text as udfald, count(*) as n
                   from public.%I
                  where %I > now() - interval ''24 hours''
                  group by 1, 2) x',
        v_s.spor, v_s.tid, v_s.udfald, v_s.spor, v_s.tid)
        into v_del;
      v_spor := v_spor || coalesce(v_del, '[]'::jsonb);
    exception when others then
      v_fejl := array_append(v_fejl, 'spor ' || v_s.spor || ': ' || sqlerrm);
    end;
  end loop;

  -- Vagtens seneste række.
  begin
    select jsonb_build_object('tid', v.tid, 'dom', v.dom, 'grunde', to_jsonb(v.grunde))
      into v_vagt
      from public.cron_vagt_log v
     order by v.id desc
     limit 1;
  exception when others then
    v_fejl := array_append(v_fejl, 'cron_vagt_log: ' || sqlerrm);
  end;

  return jsonb_build_object(
    'nu', now(),
    'jobs', v_jobs,
    'koersler', v_koersler,
    'koersler_loft', v_koersler_loft,
    'koersler_loft_ramt', v_loft_ramt,
    'aeldste_koersel', v_aeldste,
    'svar', v_svar,
    'spor', v_spor,
    'vagt', v_vagt,
    'fejl', to_jsonb(v_fejl)
  );
end;
$$;

revoke all on function public.drift_agent_laes() from public, anon, authenticated;
grant execute on function public.drift_agent_laes() to service_role;

comment on function public.drift_agent_laes() is
  'Driftsagenten (30/9-2026, skive 1): agentens ENESTE læsning af cron.job, cron.job_run_details (seneste 3000 gennem runid, 25 t), net._http_response (25 t, kun kernen af 200-svar), sporenes udfald (time/døgn) og cron_vagt_log. Oprettet SECURITY INVOKER (20260930151000 gør den til DEFINER, kræver grønt lys), STABLE, kun SELECT; hver sektion i egen EXCEPTION-blok → «fejl». EXECUTE kun til service_role. Dommen bor i supabase/functions/_shared/driftDom.ts.';

-- ── EFTER-tjek (kør og gem CSV) ──────────────────────────────────────────────
select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
  from information_schema.tables
 where table_schema = 'public' and table_name in ('drift_agent_koersler', 'drift_agent_jobs')
union all
select '2 funktioner', p.proname, concat('prosecdef=', p.prosecdef)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('drift_agent_laes', 'drift_agent_kerne')
union all
select '3 laasen', 'driftsagent_aktiv',
       coalesce((select config_value::text from public.app_config where config_key = 'driftsagent_aktiv'), 'ikke sat → false')
union all
select '4 politikker', coalesce(max(policyname), '(ingen)'), 'drift_agent_*'
  from pg_policies where schemaname = 'public' and tablename in ('drift_agent_koersler', 'drift_agent_jobs')
union all
select '5 laes (som postgres)', 'jobs/koersler/svar/spor/fejl',
       (select concat('jobs=', jsonb_array_length(l->'jobs'), ' · koersler=', jsonb_array_length(l->'koersler'),
                      ' · svar=', jsonb_array_length(l->'svar'), ' · spor=', jsonb_array_length(l->'spor'),
                      ' · fejl=', l->>'fejl')
          from (select public.drift_agent_laes() as l) x)
union all
select '6 drift_agent_jobs', 'raekker/cron.job',
       concat((select count(*) from public.drift_agent_jobs), '/', (select count(*) from cron.job))
order by 1, 2;
