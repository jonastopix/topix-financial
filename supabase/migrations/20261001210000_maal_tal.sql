-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «DINE MÅL» — TAL-MÅL (motoren, 1/10-2026; Jonas 1/10 kl. 21:04: ja til det nye
-- design af /milestones). Design: docs/dine-maal-design.md. Motor:
-- src/lib/hjemmebane/maalTal.ts. Hentning: src/hooks/dineMaalGrundlag.ts.
--
-- HVAD: fire nullable kolonner på public.milestones — ren TILFØJELSE:
--   art               text NULL  CHECK (art IN ('tal','begivenhed'))
--   maal_noegle       text NULL  CHECK (maal_noegle IN ('omsaetning_aarstakt','resultat_aarstakt',
--                                                       'likviditet_mdr','db_grad','andet_tal'))
--   udgangspunkt      numeric NULL   — tallet, målet starter fra (samme enhed som target_value)
--   udgangspunkt_dato date NULL      — dagen, sporet regnes fra (NULL → created_at, dansk dato)
-- NULL art = et mål fra før designet; fladen viser «Gør målet skarpt». Ingen
-- eksisterende række ændres, ingen default, ingen policy, ingen trigger, ingen
-- SECURITY DEFINER-funktion røres. En NULL-værdi består en CHECK (SQL-semantik),
-- så alle eksisterende rækker er gyldige fra første sekund — ingen NOT VALID nødvendig.
-- Listerne i CHECK'ene står ORDRET som MAAL_ARTER/MAAL_NOEGLER i maalTal.ts
-- (kildeværnet maalTal.guard.test.ts holder dem i takt).
--
-- RLS — FUNDET I MIGRATIONSHISTORIKKEN (kodelæst, pg_policy IKKE målt i prod):
--   INSERT: «Users can insert own milestones» WITH CHECK (auth.uid() = user_id)
--           (20260223155456:22) og «Company members can insert company milestones»
--           WITH CHECK (company_id = user_company_id(auth.uid())) (20260224222456:192).
--   UPDATE: «Users can update own milestones» USING (auth.uid() = user_id)
--           (20260223155456:23) og «Company members can update company milestones»
--           USING (company_id = user_company_id(auth.uid())) (20260224222456:196) —
--           begge UDEN WITH CHECK.
--   Alle fire er PERMISSIVE og dømmer RÆKKEN, ikke kolonnen. Ingen migration giver
--   eller tager kolonne-privilegier på milestones (grep efter GRANT/REVOKE på
--   tabellen: intet). Derfor DÆKKER de eksisterende politikker de nye kolonner
--   automatisk: medlemmet kan sætte art/maal_noegle/udgangspunkt/udgangspunkt_dato
--   på egne/virksomhedens mål fra klienten (samme vej som useMilestones skriver
--   title/target_value i dag). Rådgiveren har KUN SELECT («Advisors can view all
--   milestones», 20260223155456:27) og skriver gennem maal-skriv — som IKKE kender
--   de nye felter endnu (en ændring dér kræver eksplicit udrulning; ikke i denne PR).
--   RESTRICTIVE «Hide demo milestones from non-members» (20260903230000:112) er
--   uændret. Triggerne på milestones (updated_at, progress_updated_at,
--   milestone_completed_at, milestones_hoejst_tre_aktive) læser ingen af de nye
--   kolonner.
--
-- RÆKKEFØLGEN (ét skridt ad gangen):
--   1. Merge.
--   2. FØR-SQL herunder (gem CSV).
--   3. KØR denne migration i Lovable → SQL editor.
--   4. EFTER-SQL herunder (gem CSV).
--   5. MÅL kolonnerne over REST med anon-nøglen (fra index-*.js på app.theboardroom.dk):
--        GET https://loiavmastgeieqyiwyyr.supabase.co/rest/v1/milestones?select=art,maal_noegle,udgangspunkt,udgangspunkt_dato&limit=0
--      → 200 (42703 = kolonnerne mangler).
--   6. FØRST DA Update i Lovable for en flade, der SKRIVER felterne. Læseren
--      (hooks/dineMaalGrundlag.ts) er fail-soft: før migrationen falder den tilbage
--      på de gamle kolonner og melder afventerMigration — men en skrivning af de
--      nye felter fejler (PGRST204) indtil da.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonner' as sektion,
--          coalesce((select string_agg(column_name || ':' || data_type || ':' || is_nullable, ' · ' order by column_name)
--                      from information_schema.columns
--                     where table_schema = 'public' and table_name = 'milestones'
--                       and column_name in ('art','maal_noegle','udgangspunkt','udgangspunkt_dato')), 'findes ikke') as vaerdi
--   union all
--   select '2 milestones i alt', count(*)::text from public.milestones
--   union all
--   select '3 aktive', count(*)::text from public.milestones where status = 'active'
--   union all
--   select '4 politikker', (select string_agg(polname || ':' || polcmd || ':' || case when polpermissive then 'P' else 'R' end, ' · ' order by polname)
--                            from pg_policy where polrelid = 'public.milestones'::regclass)
--   order by 1;
--   Forventet: 1 = «findes ikke».
--
-- EFTER-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonner' as sektion,
--          coalesce((select string_agg(column_name || ':' || data_type || ':' || is_nullable, ' · ' order by column_name)
--                      from information_schema.columns
--                     where table_schema = 'public' and table_name = 'milestones'
--                       and column_name in ('art','maal_noegle','udgangspunkt','udgangspunkt_dato')), 'findes ikke') as vaerdi
--   union all
--   select '2 checks', (select string_agg(conname, ' · ' order by conname) from pg_constraint
--                        where conrelid = 'public.milestones'::regclass and conname in ('milestones_art_check','milestones_maal_noegle_check'))
--   union all
--   select '3 milestones i alt', count(*)::text from public.milestones
--   union all
--   select '4 art sat', count(*)::text from public.milestones where art is not null
--   order by 1;
--   Forventet: 1 = «art:text:YES · maal_noegle:text:YES · udgangspunkt:numeric:YES ·
--   udgangspunkt_dato:date:YES», 2 = begge navne, 3 = som FØR, 4 = 0.
--
-- RUL TILBAGE (kun før en flade skriver felterne — dvs. FØR Update):
--   ALTER TABLE public.milestones
--     DROP CONSTRAINT IF EXISTS milestones_maal_noegle_check,
--     DROP CONSTRAINT IF EXISTS milestones_art_check,
--     DROP COLUMN IF EXISTS udgangspunkt_dato,
--     DROP COLUMN IF EXISTS udgangspunkt,
--     DROP COLUMN IF EXISTS maal_noegle,
--     DROP COLUMN IF EXISTS art;

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS art text NULL,
  ADD COLUMN IF NOT EXISTS maal_noegle text NULL,
  ADD COLUMN IF NOT EXISTS udgangspunkt numeric NULL,
  ADD COLUMN IF NOT EXISTS udgangspunkt_dato date NULL;

ALTER TABLE public.milestones
  ADD CONSTRAINT milestones_art_check CHECK (art IN ('tal', 'begivenhed'));

ALTER TABLE public.milestones
  ADD CONSTRAINT milestones_maal_noegle_check CHECK (maal_noegle IN ('omsaetning_aarstakt', 'resultat_aarstakt', 'likviditet_mdr', 'db_grad', 'andet_tal'));

COMMENT ON COLUMN public.milestones.art IS
  'Målets art (Dine mål, 1/10-2026): tal = fremdriften læses af et tal; begivenhed = fremdriften er skridtene. NULL = mål fra før designet («Gør målet skarpt»).';
COMMENT ON COLUMN public.milestones.maal_noegle IS
  'Tal-målets nøgle — hvilket tal fremdriften læses af (src/lib/hjemmebane/maalTal.ts nuvaerendeTal). andet_tal = current_value (tastet). NULL for begivenhedsmål og gamle mål.';
COMMENT ON COLUMN public.milestones.udgangspunkt IS
  'Tallet målet starter fra (samme enhed som target_value). Sporet regnes som andel af vejen fra udgangspunkt til target_value.';
COMMENT ON COLUMN public.milestones.udgangspunkt_dato IS
  'Dagen sporet regnes fra; NULL = created_at (dansk dato).';
