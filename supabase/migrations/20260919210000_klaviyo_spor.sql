-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge, FØR
-- klaviyo-motor udrulles. Uden tabellen kan motoren ikke skrive sit spor, og
-- en skrivning uden spor er præcis det, tabellen findes for at forhindre.
--
-- SPORET (lag 3, udkast 19/9-2026, ~/Downloads/udkast-klaviyo-motor/README.md).
--
-- HVORFOR DEN FINDES: lag 4 er en agent, der skal kunne bygge og rette
-- kundekommunikation i Klaviyo. Klaviyo har ingen fortrydelse og ingen
-- versionshistorik, vi kan læse — retter man en mail, er den gamle udgave
-- væk. Derfor gemmer VI FØR-tilstanden, det vi sendte, og EFTER-tilstanden
-- læst tilbage. Ét menneske skal kunne læse bagud, hvad en maskine gjorde ved
-- 345 menneskers post, og kunne genskabe det, der stod før.
--
-- TØRKØRSLER SKRIVES OGSÅ. En agent, der «ville have gjort» noget, er lige så
-- interessant som en, der gjorde det — især mens lag 4 er nyt. Kolonnen
-- toerkoersel skiller dem.
--
-- INGEN HEMMELIGHEDER I TABELLEN. Klaviyo-nøglen bor i en Lovable-secret og
-- går aldrig gennem motoren til basen. Kolonnerne foer/sendt/efter rummer
-- flow- og skabelondefinitioner — indhold af mails, ikke legitimation.
--
-- RLS: rådgivere LÆSER (has_role advisor; admin arver). Ingen klient skriver;
-- kun service_role, altså edge functionen. Ingen UPDATE og ingen DELETE for
-- nogen — et spor, der kan rettes, er ikke et spor. Det håndhæves af, at der
-- ikke findes en politik for dem.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabel' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables where table_schema='public' and table_name='klaviyo_spor'
--   union all
--   select '2 politikker', concat(tablename,': ',policyname), concat(cmd,' | ',roles::text)
--     from pg_policies where schemaname='public' and tablename='klaviyo_spor'
--   union all
--   select '3 tid','now() dansk', to_char(now() at time zone 'Europe/Copenhagen','YYYY-MM-DD HH24:MI:SS')
--   order by 1,2;
--   FACIT FØR: sektion 1 og 2 TOMME.
--
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = én række; sektion 2 = 2 politikker
--   (advisor SELECT, service_role ALL); og tabellen er tom:
--   select count(*) from public.klaviyo_spor;   -- 0
--
-- ROLLBACK:
--   drop table if exists public.klaviyo_spor;

create table if not exists public.klaviyo_spor (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  -- HVAD blev der gjort
  handling      text not null check (handling in (
                  'laes_flow', 'laes_skabelon', 'laes_kampagne',
                  'opret_skabelon', 'ret_skabelon', 'ret_flowmail', 'opret_flow')),
  -- HVAD blev rørt i Klaviyo. null ved en oprettelse, der kun blev tørkørt.
  klaviyo_id    text,
  klaviyo_type  text not null check (klaviyo_type in ('flow', 'flow-action', 'template', 'campaign')),

  -- Blev der sendt noget? true = nej, kun regnet ud.
  toerkoersel   boolean not null default true,

  -- DE TRE TILSTANDE. foer og efter er hele objektet, som Klaviyo gav det;
  -- sendt er præcis den body, der gik (eller ville gå) afsted.
  foer          jsonb,
  sendt         jsonb,
  efter         jsonb,

  -- De felter, der flytter sig — udregnet af _shared/klaviyoMotorDom.ts:hvadAendres,
  -- så et menneske kan se ændringen uden at sammenligne to store blokke selv.
  aendringer    jsonb not null default '[]'::jsonb,

  -- Statusser, dommen tvang til «draft». Tom liste = intet gik live af sig selv.
  kladde_rettelser jsonb not null default '[]'::jsonb,

  udfald        text not null check (udfald in ('toerkoersel', 'skrevet', 'afvist', 'fejl')),
  -- Afvisningens eller fejlens grund i ord. Null når alt gik godt.
  grund         text,

  -- Rådgiveren bag handlingen. NOT NULL med vilje: også når lag 4 er en agent,
  -- handler den på vegne af et menneske, og det menneske står her.
  udfoert_af    uuid not null references auth.users(id) on delete restrict
);

create index if not exists klaviyo_spor_created_idx      on public.klaviyo_spor (created_at desc);
create index if not exists klaviyo_spor_klaviyo_id_idx   on public.klaviyo_spor (klaviyo_id);
create index if not exists klaviyo_spor_udfald_idx       on public.klaviyo_spor (udfald);
-- Skrivningerne alene — det, man leder efter, når noget er galt i en mail.
create index if not exists klaviyo_spor_skrevet_idx      on public.klaviyo_spor (created_at desc) where toerkoersel = false;

comment on table public.klaviyo_spor is
  'Lag 3''s spor (19/9-2026): FØR, det sendte og EFTER for hver læsning og skrivning mod Klaviyo — også tørkørsler. Klaviyo har ingen versionshistorik, vi kan læse, så denne tabel er den eneste vej tilbage til det, der stod før en agent rettede en mail. Skrives kun af klaviyo-motor (service role); rådgivere læser. Ingen UPDATE- eller DELETE-politik findes — sporet kan ikke rettes.';
comment on column public.klaviyo_spor.kladde_rettelser is
  'De statusser, tvingKladde satte til draft, før body''en blev sendt. Tom liste betyder, at intet forsøgte at gå live. Klaviyo opretter flows som kladde «unless action status is otherwise set» — dette er beviset for, at undtagelsen ikke ramte os.';
comment on column public.klaviyo_spor.udfoert_af is
  'Rådgiveren bag handlingen. NOT NULL: en agent handler altid på vegne af et menneske, og det menneske skal kunne findes bagefter.';

alter table public.klaviyo_spor enable row level security;

drop policy if exists "Advisors can view klaviyo spor" on public.klaviyo_spor;
create policy "Advisors can view klaviyo spor"
  on public.klaviyo_spor for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage klaviyo spor" on public.klaviyo_spor;
create policy "Service role can manage klaviyo spor"
  on public.klaviyo_spor for all to service_role
  using (true) with check (true);

-- EFTER-tjek (kør og gem CSV):
select '1 tabel' as sektion, table_name as noegle, 'findes' as vaerdi
  from information_schema.tables where table_schema='public' and table_name='klaviyo_spor'
union all
select '2 politikker', concat(tablename,': ',policyname), concat(cmd,' | ',roles::text)
  from pg_policies where schemaname='public' and tablename='klaviyo_spor'
union all
select '3 raekker', 'i alt', count(*)::text from public.klaviyo_spor
union all
select '4 tid','now() dansk', to_char(now() at time zone 'Europe/Copenhagen','YYYY-MM-DD HH24:MI:SS')
order by 1,2;
