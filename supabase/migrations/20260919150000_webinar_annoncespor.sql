-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge.
-- KØRES EFTER 20260919130000_webinar_tilmeldinger.sql (opretter tabellen) og
-- 20260919140000_webinar_haendelser_kilde.sql. Rækkefølgen er 130000 → 140000
-- → 150000.
--
-- ANNONCESPORET I EGNE KOLONNER (Jonas 19/9, efter målingen mod det rigtige
-- API): eWebinars svar bærer HELE sporet fra annoncen til tilmeldingen —
-- utm_source «fb», utm_medium «paid», utm_campaign/content/term, referrer,
-- og fbclid inde i «origin» — plus by, land, enhed, tidszone og widget-kilden
-- («topix-webinar-side»). Det lå kun i `raa` (jsonb). Nu står hvert felt i sin
-- egen kolonne, så vejen fra en BESTEMT Meta-annonce til et medlem kan ses,
-- søges og tælles uden at bygge noget nyt.
--
-- FBCLID ER SIT EGET FELT. Det står inde i origin-URL'ens query og plukkes ud
-- af `_shared/webinarDom.ts:plukAnnoncespor` — Meta-opsætningen (vindue B)
-- skal bruge præcis den værdi, og en URL man skal parse hver gang, er ikke et
-- felt man kan slå op på.
--
-- BEGGE VEJE FYLDER DEM. Plukket bor ét sted (webinarDom.plukTilmelding), som
-- både `ewebinar-webhook` og `ewebinar-import` kalder — så en tilmelding får
-- sporet med, uanset om den kom ind via webhooken eller importen. Webhookens
-- egen payload (help/webhook) har origin, referrer, source, city, country,
-- timezone og deviceTypeWhenRegistered, så den taber intet.
--
-- ALLEREDE KOLONNER (fra 130000, rører ikke denne migration): webinar_id,
-- webinar_titel, session_tid, session_type, registreret_at, subscribed,
-- attended, state, sidste_action, set_procent, set_procent_kilde.
--
-- IP GEMMES BEVIDST IKKE i en egen kolonne. Den står i `raa`, som service role
-- og rådgivere kan læse, men den skal ikke være et felt man kommer til at
-- filtrere og dele på. by/land/enhed/tidszone dækker behovet.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 nye kolonner' as sektion, column_name as noegle, data_type as vaerdi
--     from information_schema.columns
--     where table_schema = 'public' and table_name = 'webinar_tilmeldinger'
--       and column_name in ('utm_source','utm_medium','utm_campaign','utm_content','utm_term',
--                           'fbclid','origin','first_origin','referrer','first_referrer',
--                           'widget_source','by','land','enhed','tidszone')
--   union all
--   select '2 rækker', 'webinar_tilmeldinger', count(*)::text from public.webinar_tilmeldinger
--   union all
--   select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 er TOM (ingen af de 15 findes); sektion 2 er antallet af
--   tilmeldinger indtil nu (0, hvis hverken webhook eller import har kørt endnu).
--
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = 15 rækker, alle `text`; sektion 2 uændret
--   (kolonner tilføjes uden at røre rækker — eksisterende rækker får NULL og udfyldes
--   ved næste hændelse eller ved en genkørsel af importen).
--
-- ROLLBACK:
--   alter table public.webinar_tilmeldinger
--     drop column if exists utm_source, drop column if exists utm_medium,
--     drop column if exists utm_campaign, drop column if exists utm_content,
--     drop column if exists utm_term, drop column if exists fbclid,
--     drop column if exists origin, drop column if exists first_origin,
--     drop column if exists referrer, drop column if exists first_referrer,
--     drop column if exists widget_source, drop column if exists "by",
--     drop column if exists land, drop column if exists enhed,
--     drop column if exists tidszone;

alter table public.webinar_tilmeldinger
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists utm_content    text,
  add column if not exists utm_term       text,
  add column if not exists fbclid         text,
  add column if not exists origin         text,
  add column if not exists first_origin   text,
  add column if not exists referrer       text,
  add column if not exists first_referrer text,
  add column if not exists widget_source  text,
  add column if not exists "by"           text,
  add column if not exists land           text,
  add column if not exists enhed          text,
  add column if not exists tidszone       text;

-- Indeks kun på det man faktisk grupperer og søger på: kampagnen, kilden og
-- klik-id'et. De øvrige læses pr. række.
create index if not exists webinar_tilmeldinger_utm_campaign_idx on public.webinar_tilmeldinger (utm_campaign);
create index if not exists webinar_tilmeldinger_utm_source_idx   on public.webinar_tilmeldinger (utm_source);
create index if not exists webinar_tilmeldinger_fbclid_idx       on public.webinar_tilmeldinger (fbclid);

comment on column public.webinar_tilmeldinger.utm_source is 'Annoncesporet (19/9-2026): fx «fb». Læst af _shared/webinarDom.ts:plukAnnoncespor — fra feltet selv ELLER fra query-parametrene i origin/firstOrigin/registrationLink.';
comment on column public.webinar_tilmeldinger.fbclid is 'Metas klik-id, plukket UD af origin-URL''ens query som sit eget felt. Meta-opsætningen bruger præcis denne værdi til at koble en tilmelding til en bestemt annonce.';
comment on column public.webinar_tilmeldinger.widget_source is 'eWebinars «Widget Source» — fx «topix-webinar-side». Hvilken af vores flader tilmeldingen kom fra.';
comment on column public.webinar_tilmeldinger."by" is 'By fra eWebinars IP-opslag. Selve IP-adressen gemmes bevidst IKKE i en egen kolonne (den står i raa).';

-- EFTER-tjek (kør og gem CSV):
select '1 nye kolonner' as sektion, column_name as noegle, data_type as vaerdi
  from information_schema.columns
  where table_schema = 'public' and table_name = 'webinar_tilmeldinger'
    and column_name in ('utm_source','utm_medium','utm_campaign','utm_content','utm_term',
                        'fbclid','origin','first_origin','referrer','first_referrer',
                        'widget_source','by','land','enhed','tidszone')
union all
select '2 rækker', 'webinar_tilmeldinger', count(*)::text from public.webinar_tilmeldinger
union all
select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
order by 1, 2;
