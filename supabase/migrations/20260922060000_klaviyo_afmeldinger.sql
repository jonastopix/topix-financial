-- KØRT i prod — 22/9-2026 kl. 13:26 (Jonas, Lovable SQL editor), før merge. FØR 13:23: app_config har description; tabel, politikker, indekser og lås fandtes ikke. EFTER 13:26: tabellen · 2 politikker (SELECT authenticated, ALL service_role) · 4 indekser (pkey, email_idx, forsoegt_idx, ok_unik) · klaviyo_afmeld_aktiv = false.
-- RÆKKEFØLGEN, og hvorfor den var sådan: tabellen SKULLE stå, før ewebinar-webhook,
-- klaviyo-gensend-cron og klaviyo-afmeld-bagud udrulles. Uden den vælter HVER
-- sporskrivning (insert på en tabel, der ikke findes) — og så afmelder webhooken i
-- blinde: kaldet går til Klaviyo, men intet husker det, og næste besked afmelder igen.
--
-- AFMELDINGER VIDERE TIL KLAVIYO (Jonas 22/9-2026, ~/Downloads/recon-ewebinar-afmelding.md,
-- udkast ~/Downloads/udkast-ewebinar-afmelding/README.md):
-- eWebinar sender «Unsubscribed», og platformen gemte den hidtil UDEN at gøre noget.
-- Jonas afmeldte i hånden (6 stk. 22/9 kl. 11:18). Fra nu: en afmelding i eWebinar
-- bliver til en GLOBAL afmelding fra e-mailmarkedsføring hos Klaviyo
-- (POST /api/profile-subscription-bulk-delete-jobs, consent UNSUBSCRIBED, uden list_id).
-- IKKE undertrykkelse: en afmelding flytter samtykket, en undertrykkelse kun rækkeevnen.
--
-- ÉN RÆKKE PR. FORSØG — også de mislykkede, og også dem der aldrig blev forsøgt
-- (ingen nøgle, ingen mail). Udfaldene er klaviyo.ts' egne (ok · ingen_noegle ·
-- ingen_mail · noegle_afvist · loft · ugyldig · fejl · timeout). HELE listen står i
-- CHECK'en med vilje: en for snæver liste ville gøre en 429 (udfald «loft») til en
-- constraint-fejl, og så tabte vi netop det spor, fejlen skulle efterlade.
--
-- IDEMPOTENSEN: `klaviyo_afmeldinger_ok_unik` — unik på (email) WHERE udfald = 'ok'.
-- Klaviyo dokumenterer INGEN idempotensnøgle på endepunktet (modsat `unique_id` på
-- /events), så reglen bor her: lykkes en afmelding én gang, kan den aldrig skrives
-- som lykket igen, og bagud-fejet finder mailen ikke mere. Et forsøg, der rammer
-- reglen, giver 23505, som skriveren tier om — det ER reglen, ikke en fejl.
--
-- RLS SOM klaviyo_haendelser og klaviyo_profil: rådgivere læser, service role skriver.
-- Ingen klient muterer.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabel' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables where table_schema='public' and table_name='klaviyo_afmeldinger'
--   union all
--   select '2 politikker', policyname, concat(cmd,' | ',roles::text) from pg_policies
--     where schemaname='public' and tablename='klaviyo_afmeldinger'
--   union all
--   select '3 indekser', indexname, indexdef from pg_indexes
--     where schemaname='public' and tablename='klaviyo_afmeldinger'
--   order by 1,2;
--   FACIT FØR: alle tre sektioner TOMME.
-- EFTER-SQL: samme (sidste statement herunder).
--   FACIT EFTER: sektion 1 = 1 række · sektion 2 = 2 politikker · sektion 3 = 4 indekser
--   (pkey, email_idx, forsoegt_idx, ok_unik) · sektion 4 = klaviyo_afmeld_aktiv false.
-- Og udefra, FØR udrulningen af functionerne (CLAUDE.md «Nye migrations»):
--   GET /rest/v1/klaviyo_afmeldinger?select=email&limit=0  → 200   (42P01/42703 = mangler)
--
-- ROLLBACK:
--   drop table if exists public.klaviyo_afmeldinger;

create table if not exists public.klaviyo_afmeldinger (
  id            uuid primary key default gen_random_uuid(),
  -- Profilen hos Klaviyo findes på mailen; altid små bogstaver, som resten af huset
  -- (klaviyo_haendelser, klaviyo_profil, webinar_tilmeldinger).
  email         text not null check (email = lower(email)),
  -- Hvor afmeldingen kom fra: webhook (ewebinar-webhook i samme kald som beskeden) ·
  -- import (ewebinar-import's tilstand, optOut) · bagud (klaviyo-afmeld-bagud, fejet).
  kilde         text not null check (kilde in ('webhook', 'import', 'bagud')),
  -- eWebinars registrant-id, når vi har det. Én mail kan have flere registranter.
  ewebinar_id   text,
  forsoegt_at   timestamptz not null default now(),
  udfald        text not null,
  status        integer,
  varighed_ms   integer,
  -- Klaviyos svar, afkortet (klaviyo.ts: 2000 tegn). 202 har tom krop; fejl har en forklaring.
  svar          text,
  -- Vores egen forklaring, når udfaldet ikke er «ok».
  grund         text,
  constraint klaviyo_afmeldinger_udfald_check check (
    udfald in ('ok', 'ingen_noegle', 'ingen_mail', 'noegle_afvist', 'loft', 'ugyldig', 'fejl', 'timeout')
  )
);

-- ÉN GANG PR. MAIL. Den unikke regel er hele idempotensen — se filhovedet.
create unique index if not exists klaviyo_afmeldinger_ok_unik
  on public.klaviyo_afmeldinger (email) where udfald = 'ok';

create index if not exists klaviyo_afmeldinger_email_idx   on public.klaviyo_afmeldinger (email);
create index if not exists klaviyo_afmeldinger_forsoegt_idx on public.klaviyo_afmeldinger (forsoegt_at desc);

comment on table public.klaviyo_afmeldinger is
  'Platformens afmeldinger af mailadresser fra e-mailmarkedsføring hos Klaviyo (22/9-2026): én række pr. FORSØG, også de mislykkede. Kilden er en Unsubscribed-hændelse eller -tilstand fra eWebinar. Unik på (email) where udfald = ''ok'' — en mail afmeldes højst én gang med succes; Klaviyo har ingen idempotensnøgle på endepunktet. Kun service role skriver (ewebinar-webhook, klaviyo-gensend-cron, klaviyo-afmeld-bagud); rådgivere læser.';

comment on column public.klaviyo_afmeldinger.udfald is
  'klaviyo.ts'' egne udfald: ok · ingen_noegle · ingen_mail · noegle_afvist · loft (429) · ugyldig (400/422) · fejl · timeout. HELE listen står i CHECK''en, så en 429 kan bogføres i stedet for at vælte sporskrivningen.';

alter table public.klaviyo_afmeldinger enable row level security;

drop policy if exists "Advisors can view klaviyo afmeldinger" on public.klaviyo_afmeldinger;
create policy "Advisors can view klaviyo afmeldinger"
  on public.klaviyo_afmeldinger for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage klaviyo afmeldinger" on public.klaviyo_afmeldinger;
create policy "Service role can manage klaviyo afmeldinger"
  on public.klaviyo_afmeldinger for all to service_role
  using (true) with check (true);

-- LÅSEN: app_config.klaviyo_afmeld_aktiv, standard FALSE — bevisets lås, som
-- ga_send_aktiv og meta_send_aktiv. Bagud-fejet (klaviyo-afmeld-bagud) tørkører,
-- indtil låsen er slået til; webhookens afmelding i samme kald er IKKE bag låsen
-- (den er en enkelt handling på en enkelt person, og den er hele pointen).
-- Slås til med ÉN SQL, når tørkørslen er læst:
--   UPDATE public.app_config SET config_value = 'true'::jsonb, updated_at = now()
--    WHERE config_key = 'klaviyo_afmeld_aktiv';
-- Slukkes igen med 'false'::jsonb.
insert into public.app_config (config_key, config_value, description)
values ('klaviyo_afmeld_aktiv', 'false'::jsonb, 'Klaviyo-afmeldinger: sender klaviyo-afmeld-bagud for alvor? false = tørkørsel (standard). true sættes med én SQL, når tørkørslens liste er læst og KLAVIYO_AFMELD_KEY er bevist (22/9-2026).')
on conflict (config_key) do nothing;

-- EFTER-tjek (kør og gem CSV):
select '1 tabel' as sektion, table_name as noegle, 'findes' as vaerdi
  from information_schema.tables where table_schema='public' and table_name='klaviyo_afmeldinger'
union all
select '2 politikker', policyname, concat(cmd,' | ',roles::text) from pg_policies
  where schemaname='public' and tablename='klaviyo_afmeldinger'
union all
select '3 indekser', indexname, indexdef from pg_indexes
  where schemaname='public' and tablename='klaviyo_afmeldinger'
union all
select '4 laas', config_key, config_value::text from public.app_config
  where config_key = 'klaviyo_afmeld_aktiv'
order by 1,2;
