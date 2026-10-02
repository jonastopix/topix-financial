-- KØRT i prod 1/10-2026 ca. 23:40 via Lovable-MCP (hovedsessionen), FØR merge. FØR: kolonnerne fandtes ikke · 100 milestones (38 aktive) · 10 politikker som kodelæst nedenfor · kun milestones_status_check. EFTER: art/maal_noegle text, udgangspunkt numeric, udgangspunkt_dato date (alle nullable) · tre CHECKs som forventet · 100 rækker, 0 med art · 10 politikker uændret · nye kolonner med samme roller/privilegier. REST med anon-nøglen → 200. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «DINE MÅL» — TAL-MÅL (motoren, 1/10-2026; Jonas 1/10 kl. 21:04: ja til det nye
-- design af /milestones). Design: docs/dine-maal-design.md. Motor:
-- src/lib/hjemmebane/maalTal.ts. Hentning: src/hooks/dineMaalGrundlag.ts.
--
-- FILNAVNET (rådets fund 8, 1/10 aften): 20261001190000 — sorterer EFTER de kørte
-- 20261001110000/20261001120000 og FØR den ukørte 20261002200000_kald_edge_apikey.
-- Når denne flippes til «KØRT», står der ingen ukørt fil før den sidst kørte
-- (metaSend.guard dom 11, ventepladser-reglen). Hed før 20261001210000.
--
-- HVAD: fire nullable kolonner på public.milestones — ren TILFØJELSE:
--   art               text NULL  CHECK (art IN ('tal','begivenhed'))
--   maal_noegle       text NULL  CHECK (maal_noegle IN ('omsaetning_aarstakt','resultat_aarstakt',
--                                                       'likviditet_mdr','db_grad','andet_tal'))
--   udgangspunkt      numeric NULL   — tallet, målet starter fra (samme enhed som target_value)
--   udgangspunkt_dato date NULL      — dagen, sporet regnes fra (NULL → created_at, dansk dato)
-- og én CHECK, der knytter art og nøgle (fund 13):
--   milestones_art_noegle_check  CHECK (art IS DISTINCT FROM 'begivenhed' OR maal_noegle IS NULL)
--   — et begivenhedsmål har aldrig en tal-nøgle. Et gammelt mål (art NULL) og et
--   tal-mål består altid; en NULL består en CHECK (SQL-semantik).
-- NULL art = et mål fra før designet; fladen viser «Gør målet skarpt». Ingen
-- eksisterende række ændres, ingen default, ingen policy, ingen trigger, ingen
-- SECURITY DEFINER-funktion røres. Alle eksisterende rækker har art = NULL og
-- maal_noegle = NULL og er derfor gyldige fra første sekund — ingen NOT VALID nødvendig.
-- Listerne i CHECK'ene står ORDRET som MAAL_ARTER/MAAL_NOEGLER i maalTal.ts
-- (kildeværnet maalTal.guard.test.ts holder dem i takt).
--
-- IDEMPOTENT (fund 14): kolonnerne med ADD COLUMN IF NOT EXISTS; hver CHECK i en
-- DO-blok, der først slår navnet op i pg_constraint. En anden kørsel ændrer intet.
--
-- RLS — FUNDET I MIGRATIONSHISTORIKKEN (kodelæst; pg_policy MÅLES af FØR-SQL'en
-- herunder, sektion 4 — læs den, før migrationen køres):
--   INSERT: «Users can insert own milestones» WITH CHECK (auth.uid() = user_id)
--           (20260223155456:22) og «Company members can insert company milestones»
--           WITH CHECK (company_id = user_company_id(auth.uid())) (20260224222456:192).
--   UPDATE: «Users can update own milestones» USING (auth.uid() = user_id)
--           (20260223155456:23) og «Company members can update company milestones»
--           USING (company_id = user_company_id(auth.uid())) (20260224222456:196) —
--           begge UDEN WITH CHECK (Postgres bruger da USING som WITH CHECK).
--   Alle fire er PERMISSIVE og dømmer RÆKKEN, ikke kolonnen. Ingen migration giver
--   eller tager kolonne-privilegier på milestones (grep efter GRANT/REVOKE på
--   tabellen: intet; MÅLES i sektion 5). Derfor DÆKKER de eksisterende politikker de
--   nye kolonner automatisk: medlemmet kan sætte art/maal_noegle/udgangspunkt/
--   udgangspunkt_dato på egne/virksomhedens mål fra klienten (samme vej som
--   useMilestones skriver title/target_value i dag). Rådgiveren har KUN SELECT
--   («Advisors can view all milestones», 20260223155456:27) og skriver gennem
--   maal-skriv — som IKKE kender de nye felter endnu (en ændring dér kræver
--   eksplicit udrulning; ikke i denne PR). RESTRICTIVE «Hide demo milestones from
--   non-members» (20260903230000:112) er uændret. Triggerne på milestones
--   (updated_at, progress_updated_at, milestone_completed_at,
--   milestones_hoejst_tre_aktive) læser ingen af de nye kolonner.
--   KENDT HUL (SECURITY_BASELINE fund 6, ÅBENT): «Users can … own milestones»
--   dømmer kun user_id — et medlem kan skrive et mål med en ANDEN virksomheds
--   company_id. Stramningen er forberedt SEPARAT i
--   20261002210000_milestones_with_check.sql og kræver Jonas' grønne lys; den er
--   IKKE en del af denne migration.
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
-- FØR-SQL (ét resultatsæt — Lovables SQL editor eksporterer kun det sidste; gem CSV):
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
--   select '4 politik ' || p.polname,
--          p.polcmd::text || ' · ' || case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end
--          || ' · roller=' || coalesce((select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r where r.oid = any (p.polroles)), 'public')
--          || ' · USING=' || coalesce(pg_get_expr(p.polqual, p.polrelid), '—')
--          || ' · WITH CHECK=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '—')
--     from pg_policy p where p.polrelid = 'public.milestones'::regclass
--   union all
--   select '5 kolonneprivilegier',
--          coalesce((select string_agg(g, ' · ' order by g) from (
--                      select grantee || ':' || privilege_type || ':' || count(*) || ' kolonner' as g
--                        from information_schema.column_privileges
--                       where table_schema = 'public' and table_name = 'milestones'
--                       group by grantee, privilege_type) x), 'ingen')
--   union all
--   select '6 checks', coalesce((select string_agg(conname, ' · ' order by conname) from pg_constraint
--                                 where conrelid = 'public.milestones'::regclass and contype = 'c'), 'ingen')
--   order by 1;
--   Forventet: 1 = «findes ikke»; 4 = de fire medlemspolitikker som ovenfor (INSERT/UPDATE
--   «Users …» med kun user_id), «Advisors can view all milestones» og den RESTRICTIVE
--   demo-politik; 5 = privilegier pr. rolle (gem dem — EFTER skal vise de nye kolonner
--   med SAMME roller); 6 = ingen af milestones_art_check/_maal_noegle_check/_art_noegle_check.
--   Afviger 4 fra det kodelæste — STOP og læs politikkerne, før migrationen køres.
--
-- EFTER-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonner' as sektion,
--          coalesce((select string_agg(column_name || ':' || data_type || ':' || is_nullable, ' · ' order by column_name)
--                      from information_schema.columns
--                     where table_schema = 'public' and table_name = 'milestones'
--                       and column_name in ('art','maal_noegle','udgangspunkt','udgangspunkt_dato')), 'findes ikke') as vaerdi
--   union all
--   select '2 check ' || c.conname, pg_get_constraintdef(c.oid)
--     from pg_constraint c
--    where c.conrelid = 'public.milestones'::regclass
--      and c.conname in ('milestones_art_check','milestones_maal_noegle_check','milestones_art_noegle_check')
--   union all
--   select '3 milestones i alt', count(*)::text from public.milestones
--   union all
--   select '4 art sat', count(*)::text from public.milestones where art is not null
--   union all
--   select '5 politik ' || p.polname,
--          p.polcmd::text || ' · ' || case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end
--          || ' · roller=' || coalesce((select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r where r.oid = any (p.polroles)), 'public')
--          || ' · USING=' || coalesce(pg_get_expr(p.polqual, p.polrelid), '—')
--          || ' · WITH CHECK=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '—')
--     from pg_policy p where p.polrelid = 'public.milestones'::regclass
--   union all
--   select '6 kolonneprivilegier',
--          coalesce((select string_agg(g, ' · ' order by g) from (
--                      select grantee || ':' || privilege_type || ':' || count(*) || ' kolonner' as g
--                        from information_schema.column_privileges
--                       where table_schema = 'public' and table_name = 'milestones'
--                       group by grantee, privilege_type) x), 'ingen')
--   union all
--   select '7 nye kolonners privilegier',
--          coalesce((select string_agg(grantee || ':' || privilege_type || ':' || column_name, ' · ' order by column_name, grantee, privilege_type)
--                      from information_schema.column_privileges
--                     where table_schema = 'public' and table_name = 'milestones'
--                       and column_name in ('art','maal_noegle','udgangspunkt','udgangspunkt_dato')), 'ingen')
--   order by 1;
--   Forventet: 1 = «art:text:YES · maal_noegle:text:YES · udgangspunkt:numeric:YES ·
--   udgangspunkt_dato:date:YES»; 2 = tre rækker:
--     milestones_art_check         CHECK ((art = ANY (ARRAY['tal'::text, 'begivenhed'::text])))
--     milestones_art_noegle_check  CHECK (((art IS DISTINCT FROM 'begivenhed'::text) OR (maal_noegle IS NULL)))
--     milestones_maal_noegle_check CHECK ((maal_noegle = ANY (ARRAY['omsaetning_aarstakt'::text, …, 'andet_tal'::text])))
--   (Postgres' egen gengivelse — ordlyden kan afvige i parenteser, ikke i indhold);
--   3 = som FØR (2); 4 = 0; 5 = UÆNDRET fra FØR (4); 6 = hver rolle +4 kolonner pr.
--   privilegie ift. FØR (5); 7 = de nye kolonner med SAMME roller som de gamle.
--
-- RUL TILBAGE (kun før en flade skriver felterne — dvs. FØR Update):
--   ALTER TABLE public.milestones
--     DROP CONSTRAINT IF EXISTS milestones_art_noegle_check,
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.milestones'::regclass AND conname = 'milestones_art_check') THEN
    ALTER TABLE public.milestones
      ADD CONSTRAINT milestones_art_check CHECK (art IN ('tal', 'begivenhed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.milestones'::regclass AND conname = 'milestones_maal_noegle_check') THEN
    ALTER TABLE public.milestones
      ADD CONSTRAINT milestones_maal_noegle_check CHECK (maal_noegle IN ('omsaetning_aarstakt', 'resultat_aarstakt', 'likviditet_mdr', 'db_grad', 'andet_tal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.milestones'::regclass AND conname = 'milestones_art_noegle_check') THEN
    ALTER TABLE public.milestones
      ADD CONSTRAINT milestones_art_noegle_check CHECK (art IS DISTINCT FROM 'begivenhed' OR maal_noegle IS NULL);
  END IF;
END
$$;

COMMENT ON COLUMN public.milestones.art IS
  'Målets art (Dine mål, 1/10-2026): tal = fremdriften læses af et tal; begivenhed = fremdriften er skridtene. NULL = mål fra før designet («Gør målet skarpt»).';
COMMENT ON COLUMN public.milestones.maal_noegle IS
  'Tal-målets nøgle — hvilket tal fremdriften læses af (src/lib/hjemmebane/maalTal.ts nuvaerendeTal). andet_tal = current_value (tastet). NULL for begivenhedsmål og gamle mål (milestones_art_noegle_check).';
COMMENT ON COLUMN public.milestones.udgangspunkt IS
  'Tallet målet starter fra (samme enhed som target_value). Sporet regnes som andel af vejen fra udgangspunkt til target_value.';
COMMENT ON COLUMN public.milestones.udgangspunkt_dato IS
  'Dagen sporet regnes fra; NULL = created_at (dansk dato).';
