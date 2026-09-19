-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge.
-- KØRES EFTER 20260919130000_webinar_tilmeldinger.sql (som opretter de to
-- tabeller). Er 130000 ikke kørt endnu, så kør den først — denne migration
-- fejler pænt («relation does not exist»), den ødelægger intet.
--
-- HVOR KOM RÆKKEN FRA? (udkast 19/9-2026,
-- ~/Downloads/udkast-ewebinar-import/README.md). Engangsimporten
-- `ewebinar-import` skriver i de SAMME to tabeller som webhooken — det er
-- meningen, for det er fletningen (webinarDom.fletTilmelding) der gør, at de
-- to veje ikke kan skabe dubletter. Men så kan man bagefter ikke se, om en
-- række kom fra webhooken eller fra importen, og det er netop det Jonas skal
-- kunne svare på efter kørslen («kom de 330 ind?»).
--
-- ÉN KOLONNE, på LOGGEN alene: `webinar_haendelser.kilde`. Loggen har én
-- række pr. modtaget besked og opdateres aldrig, så 'webhook' / 'import' er
-- entydigt der. `webinar_tilmeldinger` får den IKKE: den række er de to
-- vejes fælles resultat, og et «kilde»-felt på den ville lyve, så snart
-- begge veje har rørt den. Spørgsmålet besvares i stedet gennem loggen
-- (ewebinar_id → hændelser → kilde) — se README §6.
--
-- DEFAULT 'webhook': `ewebinar-webhook` sætter IKKE feltet og skal ikke
-- ændres. Rækker skrevet før denne migration er webhook-rækker, og de får
-- den rigtige værdi af default'en.
--
-- FØR-SQL (gem CSV):
--   select '1 kolonne' as sektion, column_name as noegle, data_type as vaerdi
--     from information_schema.columns
--     where table_schema = 'public' and table_name = 'webinar_haendelser' and column_name = 'kilde'
--   union all
--   select '2 rækker i loggen', 'i alt', count(*)::text from public.webinar_haendelser
--   union all
--   select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 er TOM (kolonnen findes ikke); sektion 2 er antallet af
--   webhook-beskeder modtaget indtil nu (0, hvis eWebinar endnu ikke er koblet på).
--
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = én række (`kilde`, `text`);
--   sektion 2 uændret; og alle eksisterende rækker bærer 'webhook':
--   select kilde, count(*) from public.webinar_haendelser group by kilde;
--
-- ROLLBACK:
--   alter table public.webinar_haendelser drop column if exists kilde;

alter table public.webinar_haendelser
  add column if not exists kilde text not null default 'webhook'
  check (kilde in ('webhook', 'import'));

create index if not exists webinar_haendelser_kilde_idx on public.webinar_haendelser (kilde);

comment on column public.webinar_haendelser.kilde is
  'Hvilken vej rækken kom ind: webhook (ewebinar-webhook, signatur-verificeret POST fra eWebinar) eller import (ewebinar-import, REST-engangshentning). Default webhook — webhooken sætter ikke feltet. webinar_tilmeldinger har bevidst INGEN kilde-kolonne: den række er begge vejes fælles resultat.';

-- EFTER-tjek (kør og gem CSV):
select '1 kolonne' as sektion, column_name as noegle, data_type as vaerdi
  from information_schema.columns
  where table_schema = 'public' and table_name = 'webinar_haendelser' and column_name = 'kilde'
union all
select '2 rækker pr. kilde', coalesce(kilde, '(null)'), count(*)::text from public.webinar_haendelser group by kilde
union all
select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
order by 1, 2;
