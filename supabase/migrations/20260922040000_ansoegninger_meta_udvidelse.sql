-- KØRT i prod — 21/9-2026 kl. 22:15 (Jonas, Lovable SQL editor), FØR merge, med en vagt først. EFTER: fbc_cookie text null · fbp text null · meta_fravalg boolean not null default false.
--
-- META-UDVIDELSEN: METAS EGNE COOKIER OG FRAVALGET (22/9-2026, Jonas 21/9 aften).
--
-- HVAD: tre kolonner på public.ansoegninger —
--   fbp          Metas _fbp-cookie fra theboardroom.dk, ORDRET som Meta skrev den.
--   fbc_cookie   Metas _fbc-cookie, ORDRET. Hedder ikke «fbc», fordi payloadens fbc-felt
--                kan komme to steder fra: URL'ens fbclid har forrang, og først når det
--                mangler, bruges denne cookie. Navnet siger, hvad rækken indeholder —
--                ikke hvad der bliver sendt.
--   meta_fravalg Ansøgerens fravalg. true → meta-send-cron springer ansøgningen over med
--                grunden «fravalgt», før alt andet i dommen.
--
-- HVORFOR NU: fra 22/9 sendes ALLE ansøgninger til Metas Conversions API, ikke kun dem med
-- et klik-id i linket. Webinarvejen (annonce → topix.dk → mail → /ansoeg?kilde=webinar)
-- bærer intet fbclid og var derfor usynlig for Meta. Metas egne cookier er det, der kan
-- knytte det besøg til annoncen — de er sat på theboardroom.dk og læsbare fra
-- app.theboardroom.dk, fordi Pixelen bruger førsteparts-cookier på topdomænet.
--
-- METAS ORD (https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc/):
--   «We recommend that you always send _fbc and _fbp browser cookie values in the fbc and
--    fbp event parameters, respectively, when available.»
--   «ClickID value is case sensitive - do not apply any modifications before using, such as
--    lower or upper case.»
-- Derfor gemmes værdierne ordret. Fladen dømmer kun FORMEN (laesMetaCookies), og serveren
-- dømmer den igen (metaCookiesAf) — aldrig et gæt, aldrig en normalisering.
--
-- KUN MED SAMTYKKE: cookierne findes kun, når ansøgeren har sagt ja i cookiebanneret på
-- theboardroom.dk. Uden samtykke er begge kolonner null. Det står i persondatateksten.
--
-- FRAVALGET er håndtaget bag løftet i persondatateksten («Vil du helst være fri, så skriv
-- til kontakt@theboardroom.dk»). Indtil der er en knap i rådgiverfladen, sættes det med:
--   update public.ansoegninger set meta_fravalg = true where lower(email) = lower('<mail>');
-- Det virker med tilbagevirkende kraft på alt, der ikke allerede er sendt: dommen læser
-- kolonnen ved hver kørsel. Det, der ER sendt, kan ikke kaldes tilbage — dér er vejen
-- Metas egen sletning, og det står i noten til juristen i persondata.ts.
--
-- TIDSSTEMPLET 22/9 04:00 er valgt EFTER alt i main (seneste: 20260922021000) og efter de
-- to migrationer i udkast-klokke-mail (20260922030000 / 20260922031000), som endnu ikke er
-- kørt. En migration, der ikke er kørt, må aldrig sortere før en, der er.
-- NOTE 22/9-2026 (tilføjet, historikken urørt): denne migration blev kørt 21/9 kl. 22:15, mens
-- klokke-mailens to STADIG ikke var kørt. De blev derfor omnummereret til
-- 20260922070000/071000, da klokke-mailen blev lagt ind.
--
-- FØR-SQL (ét resultatsæt — kør FØR migrationen, gem CSV):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'ansoegninger'
--      and column_name in ('fbp', 'fbc_cookie', 'meta_fravalg')
--    order by column_name;
--   FACIT FØR: tom.
--
-- ROLLBACK:
--   alter table public.ansoegninger
--     drop column if exists fbp,
--     drop column if exists fbc_cookie,
--     drop column if exists meta_fravalg;

alter table public.ansoegninger
  add column if not exists fbp          text    null,
  add column if not exists fbc_cookie   text    null,
  add column if not exists meta_fravalg boolean not null default false;

comment on column public.ansoegninger.fbp is
  'Metas _fbp-cookie fra theboardroom.dk, gemt ved «opret» 22/9-2026 ORDRET — KUN når ansøgeren har sagt ja til cookies. Sendes som user_data.fbp til Conversions API.';
comment on column public.ansoegninger.fbc_cookie is
  'Metas _fbc-cookie, gemt ved «opret» 22/9-2026 ORDRET — KUN med samtykke. Bruges som user_data.fbc, men KUN når URL''en ikke bar et fbclid (klik-id''et har forrang).';
comment on column public.ansoegninger.meta_fravalg is
  'true = ansøgeren har bedt sig fri af målingen. meta-send-cron springer ansøgningen over med grunden «fravalgt» før alt andet. Sættes i hånden (SQL) indtil der er en knap i rådgiverfladen.';

-- EFTER-tjek (kør og gem CSV):
select column_name, data_type, is_nullable, column_default,
       col_description('public.ansoegninger'::regclass, ordinal_position) as kommentar
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ansoegninger'
   and column_name in ('fbp', 'fbc_cookie', 'meta_fravalg')
 order by column_name;
-- FACIT EFTER: tre rækker — fbc_cookie text YES, fbp text YES, meta_fravalg boolean NO med
-- default false. Hver med sin kommentar.

-- OG MÅLINGEN I PROD, før Update-klikket (husreglen om nye kolonner):
--   GET /rest/v1/ansoegninger?select=fbp,fbc_cookie,meta_fravalg&limit=0  med anon-nøglen → 200.
--   42703 = kolonnen mangler. Anon-nøglen står i den udrullede bundle (index-*.js), ikke i src.
