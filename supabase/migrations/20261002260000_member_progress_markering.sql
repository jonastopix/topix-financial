-- KØRT i prod 2/10-2026 ca. 12:45 (Claude via Lovable-MCP, atomisk i én DO-blok; Jonas «Ja, byg F0» + «Klar» 11:31). FØR: kolonnen fandtes ikke; 353 rækker; batch 199 rækker i 34 grupper hos 19 brugere (0 hos rådgivere); max(updated_at) 06:43:15.433073+00; triggeren O. EFTER: 199 markeret = 199 lig acknowledged_at; 0 uden ack; 0 markeret_af; max(updated_at) uændret; triggeren O. REST (anon, bundle index-CoAcihj5.js): ?select=markeret_at,markeret_af → 200.
--
-- AKADEMIET F0 — RÅDGIVERENS MARKERING SKILLES FRA MEDLEMMETS (2/10-2026).
-- Jonas 2/10 kl. 07:28: «Ja, byg F0». Grundlaget: docs/akademi-grundlag.md §2,
-- §4 (F0) og §6 «Sådan kendes batch-rækker».
--
-- FEJLEN: rådgiverens «Markér hele modulet» (adminContentApi.batchAcknowledge,
-- migration 20260805200000) skrev member_progress.acknowledged_at (og seen_at på
-- nye rækker) SOM MEDLEMMET. Rækken havde ingen kolonne for, hvem der skrev den.
-- Medlemmets fremdriftsbar, «Næste for dig», forsidens forløbslinje og «Kunne du
-- bruge den?» viste derfor «Gennemført» på lektioner, hun aldrig havde set.
-- MÅLT I PROD 2/10 (grundlagets §7): 330 medlemsrækker, 199 kendes som batch
-- (fingeraftrykket: ≥ 2 rækker med samme (user_id, acknowledged_at)); 12/8 =
-- 176 rækker i 31 grupper over 18 brugere, 5/8 = 23 rækker i 3 grupper hos 1
-- bruger. Batches med ÉN række kan ikke skelnes fra medlemmets eget klik.
--
-- FORMEN: to kolonner til rådgiverens markering — markeret_at (hvornår) og
-- markeret_af (hvilken rådgiver). Medlemmets egne felter (seen_at,
-- acknowledged_at, skipped_at, last_position_seconds, brugbar, brugbar_at) er
-- URØRTE: ingen rename, ingen NULL-sætning, ingen flytning. Begrundelsen:
--   * REVERSIBELT. Flyttede vi acknowledged_at → markeret_at og satte
--     acknowledged_at = NULL, var der ingen vej tilbage uden en kopi, og de
--     199 rækker er netop de usikre: fingeraftrykket er en regel, ikke et
--     bevis (grundlag §6, tre grænser). Med backfillen «markeret_at =
--     acknowledged_at» kan klienten kende en batch-række på, at de to er ENS,
--     og rullen tilbage er «UPDATE … SET markeret_at = NULL» + DROP COLUMN.
--   * KLIENTENS DOM (src/lib/hjemmebane/progressState.ts, erRaadgiverensStempel):
--     et tidsstempel, der er PRÆCIS lig markeret_at, er rådgiverens stempel —
--     acknowledged_at og seen_at tæller kun som medlemmets egne, når de IKKE
--     er det. REGNESTYKKET bag «≠» frem for «markeret_at IS NULL»: fremover
--     skriver rådgiveren KUN markeret_*. Sætter medlemmet senere selv
--     acknowledged_at (sit eget klik, sin egen tid), er de to forskellige, og
--     lektionen er hendes egen. Med «IS NULL» ville en lektion, rådgiveren har
--     gennemgået, aldrig kunne blive medlemmets egen bagefter.
--
-- BACKFILLEN rammer KUN batch-rækkerne efter fingeraftrykket (≥ 2 rækker med
-- samme (user_id, acknowledged_at)) — forventet 199 rækker blandt medlemmerne;
-- grupperingen her er over ALLE brugere (også rådgivernes egne rækker, hvis
-- de har to med samme stempel — det har de ikke efter §7, men tælles i FØR).
-- markeret_af sættes IKKE i backfillen: hvem der trykkede 5/8 og 12/8 er umålt
-- (grundlaget siger «én rådgiver», ikke hvem). NULL betyder «ukendt rådgiver».
-- updated_at BEVARES: triggeren set_member_progress_updated_at slås fra under
-- backfillen, for forløbslinjen (forloeb.ts) sorterer «fortsæt hvor du slap»
-- på updated_at, og en backfill, der stemplede 199 rækker som «nyeste
-- aktivitet», ville flytte medlemmets forløb.
--
-- RLS: ingen ny policy, ingen DROP. «Advisors can insert progress» og «Advisors
-- can update progress» (20260805200000, has_role advisor) dækker de nye
-- kolonner — policies er pr. række, ikke pr. kolonne. At rådgiveren IKKE
-- længere skriver medlemmets felter håndhæves i klienten (batchMarker,
-- kildeværn akademiF0.guard) OG i databasen af 20261002261000 (en BEFORE-
-- trigger, kolonnelås som protect_weekly_focus_seen_only). Denne fil kan
-- køres alene; værnet er et skridt for sig. Ingen SECURITY DEFINER-funktion
-- røres.
--
-- HVAD KLIENTEN GØR FØR/EFTER: medlemmets hentning er `select *` (getMyProgress)
-- — før migrationen er feltet fraværende, og dommen er som i dag. Rådgiverens
-- hentning (listAllMemberProgress) beder om kolonnerne og falder tilbage uden
-- dem ved 42703/PGRST204. Rådgiverens SKRIVNING (batchMarker) fejler HØJT før
-- migrationen («Markeringen kan ikke gemmes endnu …») — den falder bevidst ikke
-- tilbage til at skrive som medlemmet.
--
-- RÆKKEFØLGEN (ét skridt ad gangen):
--   1. Merge.
--   2. FØR-SQL herunder (gem CSV). Sektion 3 skal give 199 (grundlag §7, 02
--      kontrol) — afviger tallet, STOP og mål igen før kørslen.
--   3. KØR denne migration i Lovable → SQL editor.
--   4. EFTER-SQL herunder (gem CSV): 2 = 199 (eller FØR-SQL's sektion 3),
--      4 = 0, 5 = 0, 6 = «ja» (updated_at urørt).
--   5. MÅL kolonnen over REST med anon-nøglen (fra index-*.js på
--      app.theboardroom.dk):
--        GET https://loiavmastgeieqyiwyyr.supabase.co/rest/v1/member_progress?select=markeret_at,markeret_af&limit=0
--      → 200 (42703 = kolonnen mangler; RLS afgør ikke, om kolonnen findes).
--   6. KØR 20261002261000 (værnet) og dens EFTER-SQL.
--   7. FØRST DA Update i Lovable. Beviset i drift: et medlem med batch-rækker
--      ser i Akademiet færre «Gennemført» end før (kun egne), og på
--      /admin/indhold/fremdrift står de samme lektioner som «Gennemgået med
--      rådgiver» uden «Set af medlemmet».
--   8. KONTROL (grundlag §4, F0): kør grundlagets §6-forespørgsel igen senere
--      — sektion 01 må ikke få NYE batch-grupper efter 2/10.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   with batch as (
--     select user_id, acknowledged_at, count(*) as raekker
--     from public.member_progress
--     where acknowledged_at is not null
--     group by 1, 2 having count(*) >= 2)
--   select '1 kolonne markeret_at' as sektion,
--          coalesce((select data_type || ' · nullable=' || is_nullable
--                      from information_schema.columns
--                     where table_schema = 'public' and table_name = 'member_progress'
--                       and column_name = 'markeret_at'), 'findes ikke') as vaerdi
--   union all
--   select '2 raekker i alt', count(*)::text from public.member_progress
--   union all
--   select '3 batch-raekker (alle brugere)', coalesce(sum(raekker), 0)::text from batch
--   union all
--   select '4 batch-grupper · brugere', count(*)::text || ' · ' || count(distinct user_id)::text from batch
--   union all
--   select '5 max(updated_at)', coalesce(max(updated_at)::text, 'ingen') from public.member_progress
--   order by 1;
--   Forventet: 1 = «findes ikke», 3 = 199 (blandt medlemmerne; alle brugere kan
--   give lidt mere — skriv tallet ned), 4 = 34 · 19.
--
-- EFTER-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonne markeret_at' as sektion,
--          coalesce((select data_type || ' · nullable=' || is_nullable
--                      from information_schema.columns
--                     where table_schema = 'public' and table_name = 'member_progress'
--                       and column_name = 'markeret_at'), 'findes ikke') as vaerdi
--   union all
--   select '2 markeret_at sat', count(*)::text from public.member_progress where markeret_at is not null
--   union all
--   select '3 markeret_at = acknowledged_at (alle backfillede)', count(*)::text
--     from public.member_progress where markeret_at is not null and markeret_at = acknowledged_at
--   union all
--   select '4 markeret_at sat uden acknowledged_at (skal vaere 0)', count(*)::text
--     from public.member_progress where markeret_at is not null and acknowledged_at is null
--   union all
--   select '5 markeret_af sat (skal vaere 0 — ukendt raadgiver)', count(*)::text
--     from public.member_progress where markeret_af is not null
--   union all
--   select '6 updated_at uroert (max som FØR)',
--          case when max(updated_at) <= now() - interval '1 minute' then 'ja' else 'NEJ — triggeren stemplede' end
--     from public.member_progress
--   union all
--   select '7 trigger slaaet til igen',
--          (select tgenabled from pg_trigger where tgrelid = 'public.member_progress'::regclass
--             and tgname = 'set_member_progress_updated_at')::text
--   order by 1;
--   Forventet: 1 = «timestamp with time zone · nullable=YES», 2 = 3 = FØR-SQL's
--   sektion 3, 4 = 0, 5 = 0, 6 = «ja», 7 = «O» (origin/enabled).
--
-- RUL TILBAGE (kun FØR Update — ingen frontend læser kolonnerne endnu):
--   DROP TRIGGER IF EXISTS member_progress_markering_vaern ON public.member_progress;  -- hvis 20261002261000 er kørt
--   DROP FUNCTION IF EXISTS public.member_progress_markering_vaern();
--   ALTER TABLE public.member_progress DROP COLUMN IF EXISTS markeret_af, DROP COLUMN IF EXISTS markeret_at;
--   Medlemmets felter er urørte, så intet andet skal rulles.

BEGIN;

ALTER TABLE public.member_progress
  ADD COLUMN IF NOT EXISTS markeret_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS markeret_af uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.member_progress.markeret_at IS
  'F0 (2/10-2026): RÅDGIVERENS markering «gennemgået med rådgiver». NULL = ingen. Skrives KUN af rådgivere (adminContentApi.batchMarker); tæller ALDRIG som medlemmets egen fremdrift. På rækker backfillet 2/10 er markeret_at = acknowledged_at (den gamle batchAcknowledge skrev som medlemmet) — klienten læser et tidsstempel, der er lig markeret_at, som rådgiverens stempel, ikke medlemmets (progressState.erRaadgiverensStempel).';

COMMENT ON COLUMN public.member_progress.markeret_af IS
  'F0 (2/10-2026): rådgiveren bag markeret_at (auth.users.id). NULL på de backfillede batch-rækker fra 5/8 og 12/8 (hvem der trykkede er umålt) og når rådgiverkontoen er slettet (ON DELETE SET NULL).';

-- Backfillen: KUN fingeraftrykkets batch-rækker (≥ 2 med samme (user_id, acknowledged_at)).
-- updated_at bevares — triggeren slås fra i samme transaktion og til igen under.
ALTER TABLE public.member_progress DISABLE TRIGGER set_member_progress_updated_at;

WITH batch AS (
  SELECT user_id, acknowledged_at
  FROM public.member_progress
  WHERE acknowledged_at IS NOT NULL
  GROUP BY user_id, acknowledged_at
  HAVING count(*) >= 2
)
UPDATE public.member_progress mp
SET markeret_at = mp.acknowledged_at
FROM batch b
WHERE b.user_id = mp.user_id
  AND b.acknowledged_at = mp.acknowledged_at
  AND mp.markeret_at IS NULL;

ALTER TABLE public.member_progress ENABLE TRIGGER set_member_progress_updated_at;

COMMIT;
