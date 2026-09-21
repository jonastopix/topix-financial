-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge, FØR klaviyo-profil-cron
-- udrulles. Uden tabellen kan cronen ikke huske, hvad den skrev — og så ville hver kørsel
-- skrive alle igen (kun ændringer skrives: det er hele pointen med tabellen).
--
-- WEBINARETS TIDSPUNKT PÅ KLAVIYO-PROFILEN (Jonas 21/9-2026, ~/Downloads/udkast-webinar-tidspunkt/README.md):
-- platformen skriver to profilfelter, altid sammen, for hver tilmeldt med en kommende session:
--   tb_naeste_webinar        «2026-10-13 11:00:00»  (Klaviyos datoform, dansk tid — aldrig T/Z)
--   tb_naeste_webinar_tekst  «tirsdag 13. oktober kl. 11.00»
-- Ingen kommende session → felterne fjernes (unset). Skriveren er klaviyo-profil-cron (hver time).
--
-- TILSTAND OG SPOR I ÉN TABEL — én række pr. mail: hvad platformen SIDST SKREV (de to værdier;
-- null = fjernet eller aldrig sat), hvornår det lykkedes (skrevet_at), sidste FORSØG (forsoegt_at,
-- udfald, status, varighed_ms, svar, grund). Cronen skriver kun hos Klaviyo, hvor det ønskede
-- afviger fra tb_naeste_webinar/_tekst her (klaviyoDato.afviger). Ved et fejlet forsøg røres
-- værdierne ikke — så prøves igen næste time. Udfaldene er klaviyo.ts' (ok · ingen_noegle ·
-- noegle_afvist · loft · ugyldig · fejl · timeout).
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabel' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables where table_schema='public' and table_name='klaviyo_profil'
--   union all
--   select '2 politikker', policyname, concat(cmd,' | ',roles::text) from pg_policies
--     where schemaname='public' and tablename='klaviyo_profil'
--   order by 1,2;
--   FACIT FØR: sektion 1 og 2 TOMME.
-- EFTER-SQL: samme (sidste statement). FACIT EFTER: sektion 1 = 1 række; sektion 2 = 2 politikker.
-- Og udefra, før udrulningen: GET /rest/v1/klaviyo_profil?select=email&limit=0 → 200 (42703/42P01 = mangler).
--
-- ROLLBACK:
--   drop table if exists public.klaviyo_profil;

create table if not exists public.klaviyo_profil (
  -- Profilen hos Klaviyo findes på mailen; altid små bogstaver, som resten af huset.
  email                     text primary key check (email = lower(email)),
  -- Det, platformen sidst SKREV med udfald ok. null = fjernet (unset) eller aldrig sat.
  tb_naeste_webinar         text,
  tb_naeste_webinar_tekst   text,
  -- Hvornår sidste vellykkede skrivning gik.
  skrevet_at                timestamptz,
  -- Sidste forsøg, uanset udfald.
  forsoegt_at               timestamptz not null default now(),
  udfald                    text not null,
  status                    integer,
  varighed_ms               integer,
  -- Klaviyos svar, afkortet (klaviyo.ts: 2000 tegn). 200/201 har en profilkrop; fejl har en forklaring.
  svar                      text,
  grund                     text,
  constraint klaviyo_profil_udfald_check check (udfald in ('ok', 'ingen_noegle', 'noegle_afvist', 'loft', 'ugyldig', 'fejl', 'timeout'))
);

create index if not exists klaviyo_profil_forsoegt_idx on public.klaviyo_profil (forsoegt_at desc);
-- Det, der ikke lykkedes sidst — dem cronen prøver igen.
create index if not exists klaviyo_profil_udfald_idx   on public.klaviyo_profil (udfald) where udfald <> 'ok';

comment on table public.klaviyo_profil is
  'Platformens skrivninger af webinarets tidspunkt på Klaviyo-profilen (21/9-2026): én række pr. mail med det, der sidst blev skrevet (tb_naeste_webinar, _tekst; null = fjernet), og sidste forsøgs udfald. Kun klaviyo-profil-cron (service role) skriver, og kun hvor det ønskede afviger; rådgivere læser.';

alter table public.klaviyo_profil enable row level security;

drop policy if exists "Advisors can view klaviyo profil" on public.klaviyo_profil;
create policy "Advisors can view klaviyo profil"
  on public.klaviyo_profil for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage klaviyo profil" on public.klaviyo_profil;
create policy "Service role can manage klaviyo profil"
  on public.klaviyo_profil for all to service_role
  using (true) with check (true);

-- EFTER-tjek (kør og gem CSV):
select '1 tabel' as sektion, table_name as noegle, 'findes' as vaerdi
  from information_schema.tables where table_schema='public' and table_name='klaviyo_profil'
union all
select '2 politikker', policyname, concat(cmd,' | ',roles::text) from pg_policies
  where schemaname='public' and tablename='klaviyo_profil'
order by 1,2;
