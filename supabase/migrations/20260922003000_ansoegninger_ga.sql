-- KØRT i prod — 21/9-2026 kl. 17:01 (Jonas, Lovable SQL editor), FØR merge, med en vagt først. EFTER: ga_client_id og ga_session_id text, nullable, med kommentar.
--
-- GOOGLE ANALYTICS' KLIENT-ID OG SESSION-ID PÅ ANSØGNINGEN (21/9-2026 aften, chatten 16:45).
--
-- HVAD: to kolonner på public.ansoegninger — ga_client_id (de to sidste dele af cookien
-- _ga, «<tal>.<tal>») og ga_session_id (session-id'et fra _ga_6LHR66CDJ4, kun cifre) —
-- læst af fladen ved mount og gemt ved «opret» i en EGEN fail-soft update efter
-- annoncesporet (ansoegning-gem). Serveren dømmer formen igen (ansoegningSkema.gaAf).
--
-- HVORFOR: platformen har intet GA, og linket fra theboardroom.dk bærer ikke GA's id
-- (recon-ga4.md §0). Det, der kan knytte en ansøgning til besøgets kilde i GA4, er
-- netop client_id + session_id fra theboardroom.dk's cookies — de er læsbare fra
-- app.theboardroom.dk, fordi GA's cookie_domain er standarden 'auto' (= theboardroom.dk).
--
-- KUN MED SAMTYKKE: cookierne findes kun, når ansøgeren har sagt ja i cookiebanneret på
-- theboardroom.dk (Consent Mode default 'denied' siden 21/9). Uden samtykke er begge
-- kolonner null — aldrig et gæt, aldrig et genereret id.
--
-- SENDES ENDNU IKKE: afsendelsen til GA (Measurement Protocol) er ikke bygget — kun
-- opsamlingen (beslutning 21/9). Meta-payloaden må aldrig bære dem (FORBUDTE_NOEGLER).
--
-- FØR-SQL (ét resultatsæt — kør FØR migrationen, gem CSV):
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'ansoegninger' and column_name like 'ga_%'
--    order by column_name;
--   FACIT FØR: tom.
--
-- ROLLBACK:
--   alter table public.ansoegninger drop column if exists ga_client_id, drop column if exists ga_session_id;

alter table public.ansoegninger
  add column if not exists ga_client_id  text null,
  add column if not exists ga_session_id text null;

comment on column public.ansoegninger.ga_client_id is
  'Google Analytics'' klient-id (de to sidste dele af cookien _ga, «<tal>.<tal>»), gemt ved «opret» 21/9-2026 — KUN når ansøgeren har sagt ja til cookies på theboardroom.dk. Sendes endnu ikke til Google; aldrig til Meta.';
comment on column public.ansoegninger.ga_session_id is
  'Google Analytics'' session-id (fra cookien _ga_6LHR66CDJ4, GS1 tredje del / GS2 feltet s…), gemt ved «opret» 21/9-2026 — KUN med samtykke på theboardroom.dk. Sendes endnu ikke til Google; aldrig til Meta.';

-- EFTER-tjek (kør og gem CSV):
select column_name, data_type, is_nullable,
       col_description('public.ansoegninger'::regclass, ordinal_position) as kommentar
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ansoegninger' and column_name in ('ga_client_id', 'ga_session_id')
 order by column_name;
-- FACIT EFTER: to rækker, text, YES, hver med sin kommentar.
