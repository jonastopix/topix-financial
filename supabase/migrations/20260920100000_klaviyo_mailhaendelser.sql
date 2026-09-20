-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge.
--
-- KLAVIYOS HÆNDELSER TILBAGE TIL OS (udkast 19/9-2026) — lag 5 af seks.
--
-- Lag 2 sender TIL Klaviyo. Denne tabel er vejen tilbage. Uden den kan en agent
-- kun gætte, hvad der virkede: Klaviyo ser åbninger, Meta ser klik, og kun
-- platformen ved, hvem der blev medlem og for hvor meget.
--
-- ÉN RÆKKE PR. HÆNDELSE PR. PERSON — IKKE ET ØJEBLIKSBILLEDE. En optælling
-- («hvor mange åbnede sidste webinar?») kan ikke regnes bagud, når spørgsmålet
-- tre måneder senere er et andet: «hvilken mail gik forud for de ansøgninger,
-- der blev til medlemmer?». Rækkerne kan.
--
-- MASKINER OG BOTTER GEMMES, MEN ER ALDRIG BEVIS. Målt 19/9 på flow UiECQS i
-- september: 1 menneskeklik mod 42 bot-klik — sikkerhedsscannere, der følger
-- hvert link, før modtageren ser mailen. Klaviyos eget Reporting API sagde
-- `clicks_unique: 2` for samme periode, hvor de rå hændelser gav 43; Klaviyo
-- filtrerer altså allerede. Gemmer vi flagene, kan vores tal stemme med
-- Klaviyos UI. Gemmer vi dem ikke, opstår en uenighed, ingen kan forklare —
-- og så stoler ingen på nogen af tallene.
--
-- NØGLEN MELLEM MODTAGET/ÅBNET/KLIKKET ER `forsendelse_id`, ikke `$event_id`.
-- Målt: `$event_id` er «<besked>:<forsendelse>» på modtaget, men
-- «<besked>:<forsendelse>:<tid>» på åbnet og klikket. Den er altså ikke ens for
-- samme udsendelse. Transmission ID er. Havde vi valgt `$event_id`, ville ingen
-- åbning kunne bindes til sin egen mail, og det ville se ud, som om ingen åbnede.
--
-- MAILEN I KLARTEKST og altid lower: den er den eneste kobling til
-- `ansoegninger` og `webinar_tilmeldinger`. Tabellen er service-role-only;
-- rådgivere får SELECT, så fladen senere kan vise forløbet bag en ansøgning.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables where table_schema='public'
--       and table_name in ('klaviyo_mailhaendelser','klaviyo_hentning')
--   union all
--   select '2 politikker', policyname, concat(cmd,' | ',roles::text) from pg_policies
--     where schemaname='public' and tablename in ('klaviyo_mailhaendelser','klaviyo_hentning')
--   order by 1,2;
--   FACIT FØR: sektion 1 og 2 TOMME.
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = 2 rækker; sektion 2 = 4 politikker.
--
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = 2 rækker; sektion 2 = 4 politikker;
-- plus view public.klaviyo_kobling_oversigt (select * from it — tom er ok før første hentning).
--
-- ROLLBACK:
--   select cron.unschedule('klaviyo-hentning');
--   drop view if exists public.klaviyo_kobling_oversigt;
--   drop table if exists public.klaviyo_mailhaendelser;
--   drop table if exists public.klaviyo_hentning;

create table if not exists public.klaviyo_mailhaendelser (
  id                 uuid primary key default gen_random_uuid(),
  -- Klaviyos eget hændelses-id. UNIKT: hentningen henter bevidst overlappende
  -- (greater-or-equal), fordi et hul er værre end en dublet. Dubletten dør her.
  klaviyo_event_id   text not null unique,
  -- modtaget · aabnet · klikket
  art                text not null check (art in ('modtaget','aabnet','klikket')),
  sket_ved           timestamptz not null,
  email              text not null check (email = lower(email)),
  klaviyo_profil_id  text,
  -- Flowets id (WFzxH9 · UiECQS · YcBF9f). Kampagner har ingen og hentes ikke.
  flow_id            text,
  -- Den ENKELTE mail i flowet. Det er dette niveau, dommen regner på.
  besked_id          text,
  besked_navn        text,
  emne               text,
  -- Klaviyos Transmission ID: binder en åbning til den udsendelse, den hører til.
  forsendelse_id     text,
  -- machine_open: postkassen hentede billedet. Tælles, aldrig bevis.
  maskine            boolean not null default false,
  -- Bot Click: en scanner fulgte linket. Tælles, aldrig bevis.
  bot                boolean not null default false,
  url                text,
  raa                jsonb not null,
  hentet_ved         timestamptz not null default now()
);

-- Dommen slår op pr. person og rækkefølge; det er det opslag, der skal være hurtigt.
create index if not exists klaviyo_mailh_email_tid_idx on public.klaviyo_mailhaendelser (email, sket_ved);
create index if not exists klaviyo_mailh_besked_idx    on public.klaviyo_mailhaendelser (besked_id, sket_ved desc);
create index if not exists klaviyo_mailh_flow_idx      on public.klaviyo_mailhaendelser (flow_id, sket_ved desc);
create index if not exists klaviyo_mailh_forsendelse_idx on public.klaviyo_mailhaendelser (forsendelse_id);
-- Kun de menneskelige rækker, til de tal der skal stemme med Klaviyos UI.
create index if not exists klaviyo_mailh_menneske_idx  on public.klaviyo_mailhaendelser (art, sket_ved desc)
  where maskine = false and bot = false;

comment on table public.klaviyo_mailhaendelser is
  'Klaviyos mailhændelser hentet tilbage (udkast 19/9-2026, lag 5). Én række pr. hændelse pr. person — historik, ikke øjebliksbillede. maskine/bot gemmes, men er aldrig bevis: målt 1 menneskeklik mod 42 bot-klik på UiECQS i september.';

-- Vandmærket. Én række pr. art, så en afbrudt kørsel kan genoptages uden hul.
create table if not exists public.klaviyo_hentning (
  art             text primary key check (art in ('modtaget','aabnet','klikket')),
  -- Nyeste hændelsestid vi har hentet. Næste kørsel starter HER, ikke efter.
  hentet_til      timestamptz not null,
  sidste_koersel  timestamptz not null default now(),
  -- Sidste kørsels udfald: faerdig · budget · loft · fejl · ingen_noegle.
  sidste_grund    text,
  antal_hentet    integer not null default 0
);

comment on table public.klaviyo_hentning is
  'Vandmærke pr. hændelsesart for klaviyo-hentning-cron. hentet_til rykkes KUN når kørslen blev færdig — en afbrudt kørsel må aldrig efterlade et hul.';

alter table public.klaviyo_mailhaendelser enable row level security;
alter table public.klaviyo_hentning       enable row level security;

-- Ingen klient-mutation. Mønsteret er det samme som slack_*_log og email_send_*.
drop policy if exists "Advisors can view klaviyo mailhaendelser" on public.klaviyo_mailhaendelser;
create policy "Advisors can view klaviyo mailhaendelser"
  on public.klaviyo_mailhaendelser for select
  using (has_role(auth.uid(), 'advisor'::app_role));

drop policy if exists "Service role manages klaviyo mailhaendelser" on public.klaviyo_mailhaendelser;
create policy "Service role manages klaviyo mailhaendelser"
  on public.klaviyo_mailhaendelser for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Advisors can view klaviyo hentning" on public.klaviyo_hentning;
create policy "Advisors can view klaviyo hentning"
  on public.klaviyo_hentning for select
  using (has_role(auth.uid(), 'advisor'::app_role));

drop policy if exists "Service role manages klaviyo hentning" on public.klaviyo_hentning;
create policy "Service role manages klaviyo hentning"
  on public.klaviyo_hentning for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── HVOR STOR ER DEN GRUPPE, DER IKKE KAN KOBLES? ──────────────────────────
-- Én række pr. indsendt ansøgning med dens kobling — de fire værdier fra
-- mailForlob.ts:Kobling, regnet i SQL, så tallet kan slås op i prod uden kode.
-- «ikke_i_klaviyo» og «ingen_mail_foer» må ALDRIG se ens ud: den ene ansøgte
-- med en anden adresse, den anden kom uden om flowet.
create or replace view public.klaviyo_kobling_oversigt
with (security_invoker = true) as
with a as (
  select id, lower(email) as email, indsendt_at
  from public.ansoegninger
  where email is not null and indsendt_at is not null
),
h as (
  select email,
         bool_or(art = 'modtaget')                                       as fik_mail,
         bool_or(art = 'aabnet' and maskine = false and bot = false)     as aabnede_som_menneske
  from public.klaviyo_mailhaendelser m
  join a on a.email = m.email and m.sket_ved < a.indsendt_at
  group by email
),
k as (select distinct email from public.klaviyo_mailhaendelser)
select a.id as ansoegning_id, a.email, a.indsendt_at,
  case
    when k.email is null                      then 'ikke_i_klaviyo'
    when coalesce(h.fik_mail, false) = false  then 'ingen_mail_foer'
    when h.aabnede_som_menneske = false       then 'modtaget_uden_aabning'
    else 'fuld'
  end as kobling
from a
left join k on k.email = a.email
left join h on h.email = a.email;

comment on view public.klaviyo_kobling_oversigt is
  'Pr. indsendt ansøgning: fuld · modtaget_uden_aabning · ingen_mail_foer · ikke_i_klaviyo (lag 5, 20/9). Gruppens størrelse: select kobling, count(*) from klaviyo_kobling_oversigt group by 1.';

-- ── RYTMEN: hver time — hvert kvarter på en dag med session (Jonas 20/9) ──
-- ÉT job, ikke to: to jobs ville begge fyre kl. :00 på sessionsdage. Jobbet
-- vækkes hvert kvarter, og SQL-vagten afgør, om der kaldes:
--   · minut 0                                     → altid
--   · session i webinar_tilmeldinger I DAG (dansk) → også :15 :30 :45
-- Ingen skal ændre noget tirsdag morgen eller rulle tilbage onsdag.
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).
-- Tørkørsel er standard i functionen; her sendes dry_run:false, som de andre.
SELECT cron.schedule(
  'klaviyo-hentning',
  '*/15 * * * *',
  $job$
  SELECT public.kald_edge(
    'klaviyo-hentning-cron',
    '{"dry_run": false}'::jsonb,
    60000,     -- timeout: under kald_edge_loft_ms() (150 s); functionens eget budget er 25 s
    900000     -- jobbets interval (15 min) — kald_edge afviser en timeout, der ikke er kortere
  )
  WHERE extract(minute from now() at time zone 'Europe/Copenhagen')::int = 0
     OR EXISTS (
       SELECT 1 FROM public.webinar_tilmeldinger
        WHERE (session_tid AT TIME ZONE 'Europe/Copenhagen')::date
            = (now()       AT TIME ZONE 'Europe/Copenhagen')::date
     );
  $job$
);

-- Efter-verifikation (kør med det samme, bogfør svaret i dette filhoved):
--   SELECT jobid, jobname, schedule, active, (command LIKE '%*/15%' OR schedule = '*/15 * * * *') AS kvarter,
--          (command LIKE '%webinar_tilmeldinger%') AS har_vagt, command
--     FROM cron.job WHERE jobname = 'klaviyo-hentning';
--   FACIT: 1 række, active = true, schedule '*/15 * * * *', har_vagt = true.
-- Og at vagten faktisk skelner (kør begge, forvent true/false alt efter dagen):
--   SELECT EXISTS (SELECT 1 FROM public.webinar_tilmeldinger
--     WHERE (session_tid AT TIME ZONE 'Europe/Copenhagen')::date = (now() AT TIME ZONE 'Europe/Copenhagen')::date) AS session_i_dag;
