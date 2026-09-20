-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- Kan køres FØR eller EFTER merge: ansoegning-gem skriver sporet i en EGEN
-- update efter insert'en, fail-soft — mangler kolonnerne, logges det, og
-- ansøgeren mærker intet. Men uden migrationen gemmes intet spor, så: kør den
-- samme dag.
--
-- ANNONCESPORET PÅ ANSØGNINGEN (udkast 2, 21/9-2026, ~/Downloads/udkast-to-spor-2/):
-- samme otte felter som webinartilmeldingen fik i 20260919150000 — så det
-- direkte spor (theboardroom.dk → /ansoeg) kan kobles til kampagne og annonce.
-- Indtil nu vidste en ansøgning derfra kun, at den kom «fra sitet».
-- Værdierne gemmes, som de kom (trimmet, afkortet; fbclid kun URL-sikre tegn;
-- landing uden ?t=). Oversættelsen fb → Facebook sker ved læsning
-- (annoncekilde.ts), aldrig her.
--
-- PERSONDATA: fbclid er Metas klik-id og referrer/landing er URL'er — ingen
-- af dem er persondata i sig selv, men persondatateksten skal LÆSES IGEN med
-- de otte navne, før den første ansøgning gemmes med dem (CAPI-udkastets §4
-- dækkede kun fbclid). Sendes IKKE til Meta — det er et andet udkast.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='ansoegninger'
--      and column_name in ('utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','landing','referrer')
--    order by 1;
--   FACIT FØR: 0 rækker. EFTER (samme): 8 rækker.
--   Og udefra, før Update: GET /rest/v1/ansoegninger?select=fbclid&limit=0 → 200 (42703 = mangler).
--
-- ROLLBACK:
--   alter table public.ansoegninger drop column if exists utm_source, drop column if exists utm_medium,
--     drop column if exists utm_campaign, drop column if exists utm_content, drop column if exists utm_term,
--     drop column if exists fbclid, drop column if exists landing, drop column if exists referrer;
--   (koden tåler det: gemAnnoncespor logger og fortsætter)

alter table public.ansoegninger
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content  text,
  add column if not exists utm_term     text,
  add column if not exists fbclid       text,
  add column if not exists landing      text,
  add column if not exists referrer     text;

comment on column public.ansoegninger.utm_content is
  'Annoncesporet (21/9-2026): utm_content fra det link, /ansoeg blev åbnet med — efter 20/9 Metas ad-id ({{ad.id}}). Gemt som det kom, ved «opret». Kobles til meta_annonce.ad_id.';
comment on column public.ansoegninger.utm_campaign is
  'Annoncesporet (21/9-2026): utm_campaign fra linket — efter 20/9 Metas campaign-id. Kobles til meta_annonce.campaign_id.';
comment on column public.ansoegninger.fbclid is
  'Metas klik-id fra linket (?fbclid=), gemt ved «opret» (21/9-2026). Kun [A-Za-z0-9_-], højst 255 tegn. Sendes IKKE til Meta herfra.';
comment on column public.ansoegninger.landing is
  'URL''en, /ansoeg blev åbnet med, uden ?t= (21/9-2026). Højst 1000 tegn.';
comment on column public.ansoegninger.referrer is
  'document.referrer ved åbningen af /ansoeg (21/9-2026) — typisk theboardroom.dk. Højst 255 tegn.';

-- EFTER-tjek:
select column_name from information_schema.columns
 where table_schema='public' and table_name='ansoegninger'
   and column_name in ('utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','landing','referrer')
 order by 1;
