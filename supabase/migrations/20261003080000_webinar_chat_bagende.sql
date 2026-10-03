-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- OG FØR webinar-puls og webinar-motor-cron UDRULLES (docs/webinarmotor.md §7.10).
--
-- WEBINARCHATTENS BAGENDE (spec'ens skive 5, 3/10-2026): klokken ved et nyt spørgsmål og
-- værtens svar på mail til den, der er gået. Målt i prod 3/10: i Mortens webinar 22/9 skrev
-- 83 af 384 i chatten (154 beskeder) — chatten er det mest brugte.
--
-- TO TING, BEGGE KUN TILFØJENDE:
--   1. LÅSEN app_config.webinar_svar_mail_aktiv = false (ON CONFLICT DO NOTHING). Fraværende
--      er også false (cronen læser fail-closed) — rækken skrives, så låsen kan SES og åbnes
--      med én vagtet UPDATE. Prøven til én adresse (`email` i cronens body) sender uden låsen.
--   2. DELINDEKSET advisor_notifications_webinar_spoergsmaal_ulaest_uidx — HØJST ÉN ULÆST
--      klokke «webinar_spoergsmaal» pr. (rådgiver, session). Klokken skrives fra webinar-puls,
--      op til ~33 kald i sekundet ved 500 seere; dedup-opslaget før indsættelsen
--      (raadgivereUdenUlaestKlokke) kan ikke alene stoppe to spørgsmål i samme sekund. Den
--      tabende indsættelse får 23505, som skriveren tæller som «fandtes» (ikke en fejl). En
--      LÆST klokke står uden for indekset — næste spørgsmål ringer igen.
--
-- MÅLT FØR BYGNINGEN (kodelæst i migrationshistorikken, ikke i prod): advisor_notifications.type
-- er `TEXT NOT NULL` uden CHECK (20260226070216; ingen senere migration tilføjer en). Derfor
-- ingen CHECK-ændring her. FØR-SQL'ens sektion 3 MÅLER det i prod: står der en CHECK, STOP —
-- så skal den have «webinar_spoergsmaal» med, før webinar-puls udrulles.
--
-- ÉN TRANSAKTION (begin … commit). Kan køres igen (if not exists / on conflict do nothing).
--
-- FØR-SQL (ét resultatsæt — kør FØR, gem CSV):
--   select '1 laas' as sektion, coalesce((select config_value::text from public.app_config where config_key = 'webinar_svar_mail_aktiv'), 'ikke sat') as vaerdi
--   union all
--   select '2 indeks', coalesce((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'advisor_notifications_webinar_spoergsmaal_ulaest_uidx'), 'findes ikke')
--   union all
--   select '3 type-check', coalesce((select string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ') from pg_constraint
--     where conrelid = 'public.advisor_notifications'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%type%'), 'ingen')
--   union all
--   select '4 raekker af typen', count(*)::text from public.advisor_notifications where type = 'webinar_spoergsmaal'
--   union all
--   select '5 skive1 webinar_spoergsmaal', count(*)::text from information_schema.tables
--    where table_schema = 'public' and table_name = 'webinar_spoergsmaal';
-- FACIT FØR: 1 «ikke sat» · 2 «findes ikke» · 3 «ingen» (ellers STOP, se ovenfor) · 4 «0» ·
--   5 «1» (skive 1 kørt — ellers er der intet spørgsmål at ringe for; migrationen virker
--   alligevel, men webinar-puls og webinar-motor-cron forudsætter skive 1).
--
-- EFTER-SQL (ét resultatsæt — kør EFTER, gem CSV): samme som FØR.
-- FACIT EFTER: 1 «false» · 2 «CREATE UNIQUE INDEX advisor_notifications_webinar_spoergsmaal_ulaest_uidx
--   ON public.advisor_notifications USING btree (advisor_id, reference_id) WHERE ((type = 'webinar_spoergsmaal'::text)
--   AND (read_at IS NULL))» · 3 «ingen» · 4 «0» · 5 «1».
--
-- ROLLBACK:
--   begin;
--   drop index if exists public.advisor_notifications_webinar_spoergsmaal_ulaest_uidx;
--   delete from public.app_config where config_key = 'webinar_svar_mail_aktiv' and config_value = 'false'::jsonb;
--   commit;
--
-- JONAS ÅBNER LÅSEN (først efter beviserne og prøven, §7.10 — SELECT før/efter, vagtet på false):
--   update public.app_config set config_value = 'true'::jsonb, updated_at = now()
--    where config_key = 'webinar_svar_mail_aktiv' and config_value = 'false'::jsonb;

begin;

insert into public.app_config (config_key, config_value, description)
values ('webinar_svar_mail_aktiv', 'false'::jsonb,
  'Webinarmotoren: sender webinar-motor-cron værtens svar på MAIL til den seer, der er gået (ingen puls i 3 min) eller hvis session er slut? false = nej (standard) — svaret vises kun i rummet. Prøven til én adresse (`email`) sender uden låsen. Konsollens tekst følger låsen (3/10-2026, docs/webinarmotor.md §7.10).')
on conflict (config_key) do nothing;

create unique index if not exists advisor_notifications_webinar_spoergsmaal_ulaest_uidx
  on public.advisor_notifications (advisor_id, reference_id)
  where type = 'webinar_spoergsmaal' and read_at is null;

commit;
