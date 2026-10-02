-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «DINE MÅL», SKIVE 3 — bekræftelsen og kvartalstjekket (Jonas' svar på
-- aftenlisten 1/10-2026 kl. 22:04–22:09; docs/dine-maal-design.md «Skive 3»).
--
-- 1. «Ja, ét klik» — et mål, en rådgiver (eller agent/AI/handout) har skrevet,
--    tæller først som medlemmets, når medlemmet har trykket «Det er vores mål».
--    Indtil da er det et FORSLAG: tæller ikke i pladserne, ikke i Score, ikke
--    i forsidens fokus.
-- 2. «Bekræft eller slip ved næste login» — de gamle, mest maskinskrevne mål
--    (målt i prod 1/10: 29 af 36 aktive er skrevet af agent, AI eller et
--    handout) møder samme mekanik: «Behold» (= bekræft) eller «Slip» (= parkér,
--    status 'parked' som den eksisterende parkering; SLET aldrig).
-- 4. «Medlemmet selv» + «rådgiverne skal have en linje på forsiden» —
--    kvartalstjek pr. mål i måned 3, 6 og 9 fra bekræftelsen (dansk dato):
--    Behold · Justér tal og dato · Parkér · Nået. Tjekket registreres
--    (tidspunkt + valg) i den nye tabel maal_kvartalstjek.
--
-- HVORDAN «SKREVET AF AGENT/AI/HANDOUT» KENDES (målt i koden og
-- git-historikken 2/10-2026): kolonnen `milestones.source` (text NOT NULL
-- DEFAULT 'manual', 20260223155456; INGEN CHECK). Værdierne, der nogensinde er
-- skrevet: 'manual' = medlemmets klient (useMilestones.opret,
-- dineMaalGrundlag.opretMaalMedTal), 'handout' = handoutEngine (løftestang →
-- mål), 'legat' = create-legat-enrollment («Book dit Momentumkald»),
-- 'advisor' = maal-skriv (rådgiverens vej, fra 16/9), 'agent' =
-- run-company-agent (create_milestone, fjernet i #939 16/9), 'ai' =
-- FileUploadZone/AIProgressWidget (slettet marts 2026). Prod-fordelingen er
-- IKKE målt af denne session — FØR-SQL'en sektion 3 måler den.
--
-- HVAD (kun TILFØJENDE — ingen policy, trigger eller SECURITY DEFINER-funktion røres):
--   milestones.bekraeftet_at  timestamptz NULL  — hvornår medlemmet bekræftede («Det er vores mål» / «Behold»)
--   milestones.bekraeftet_af  uuid NULL         — hvem (auth.uid() i klienten)
--   public.maal_kvartalstjek  — én række pr. (mål, kvartal 1|2|3) med valg og tidspunkt
--
-- BACKFILL (guardet): eksisterende mål, MEDLEMMET SELV har skrevet, sættes som
-- bekræftet med bekraeftet_at = created_at og bekraeftet_af = user_id. «Selv»
-- = source = 'manual' OG user_id er medlem af målets virksomhed
-- (company_members) — fordi klientvejen også kan bruges af en rådgiver med sit
-- eget user_id (RLS «Users can insert own milestones» dømmer kun user_id).
-- Alle statusser (også parkerede og nåede — bekræftelsen er historik).
-- Maskinskrevne (handout/legat/advisor/agent/ai) forbliver ubekræftede og
-- møder punkt 2 ved næste besøg. Guard: WHERE bekraeftet_at IS NULL — en
-- anden kørsel rammer nul rækker.
--
-- KVARTALSTJEKKET — REGNESTYKKET (src/lib/hjemmebane/maalBekraeft.ts):
--   anker  = bekraeftet_at som DANSK dato (kbhDato)
--   dato_k = anker + 3·k måneder (laegMaanederTilDato), k = 1, 2, 3  (måned 3, 6, 9)
--   et tjek k VENTER, når dato_k ≤ i dag (dansk) < anker + 12 måneder, målet er
--   aktivt og bekræftet, og der ikke findes en række med kvartal ≥ k.
--   Et registreret tjek dækker de tidligere (UNIQUE (milestone_id, kvartal)).
--
-- RLS PÅ maal_kvartalstjek (husets mønstre, CLAUDE.md «RLS-mønstre»):
--   SELECT medlem:   company_id = user_company_id(auth.uid())           (company-scoped)
--   INSERT medlem:   samme + valgt_af = auth.uid() + målet hører til virksomheden
--                    (EXISTS på milestones under medlemmets egen RLS)
--   SELECT rådgiver: has_role(auth.uid(), 'advisor')                   (advisor-bred læs — forsidens linje)
--   INGEN UPDATE/DELETE: sporet er append-only (som webinar_deling_spor); en
--   række forsvinder kun med målet (FK ON DELETE CASCADE — kaskaden kører som
--   tabelejer og rammer ikke RLS). anon intet. Alle policies er PERMISSIVE og
--   giver kun JA — intet at nægte, ingen RESTRICTIVE nødvendig (BASELINE §5).
--   Hvorfor ikke kun user_id (self-only)? Et kvartalstjek er VIRKSOMHEDENS svar
--   på virksomhedens mål — en medejer skal se, at det er taget.
--
-- BEKRÆFTELSEN SKRIVES AF MEDLEMMET GENNEM DEN EKSISTERENDE RLS: «Company
-- members can update company milestones» USING (company_id =
-- user_company_id(auth.uid())) dækker også et mål, en rådgiver skrev (user_id =
-- rådgiveren). Klientens UPDATE er guardet `.is("bekraeftet_at", null)
-- .eq("status", "active")` — nul rækker er en tydelig fejl.
--
-- PLADSERNE: triggeren milestones_hoejst_tre_aktive (20260917150000) tæller
-- stadig ALLE status = 'active' — også ubekræftede. Den er BEVIDST IKKE rørt
-- (kun tilføjende migration). Følgen: fladen tæller pladser blandt de
-- bekræftede, men viser «Plads, når I har taget stilling» i stedet for «Sæt et
-- mål», når de ubekræftede ville fylde triggerens tre (dineMaal.ts:
-- pladsOptagetAfUbekraeftede) — fladen lover aldrig en plads, databasen
-- afviser. En trigger, der kun tæller bekræftede, er et ÅBENT punkt (kræver
-- grønt lys; docs/dine-maal-design.md «Skive 3» §6).
--
-- FAIL-SOFT I KLIENTEN før kørsel: hentningerne læser de nye kolonner og
-- falder tilbage på de gamle ved 42703/PGRST204 (erManglendeKolonne) —
-- bekræftelsesmodellen er da slået fra (alle mål tæller som i dag), og
-- maal_kvartalstjek læses fail-soft som tom (erManglendeTabel). Score læser
-- igen kpi_targets, indtil kolonnen findes.
--
-- RÆKKEFØLGEN (ét skridt ad gangen):
--   1. Merge.
--   2. FØR-SQL herunder (gem CSV — sektion 3 og 5 er backfillens størrelse).
--   3. KØR denne migration i Lovable → SQL editor.
--   4. EFTER-SQL herunder (gem CSV).
--   5. MÅL over REST med anon-nøglen (fra index-*.js på app.theboardroom.dk):
--        GET https://loiavmastgeieqyiwyyr.supabase.co/rest/v1/milestones?select=bekraeftet_at,bekraeftet_af&limit=0 → 200
--        GET https://loiavmastgeieqyiwyyr.supabase.co/rest/v1/maal_kvartalstjek?select=id&limit=0 → 200
--      (42703 = kolonnerne mangler; PGRST205/42P01 = tabellen mangler).
--   6. FØRST DA Update i Lovable.
--
-- FØR-SQL (ét resultatsæt — Lovables SQL editor eksporterer kun det sidste; gem CSV):
--   select '1 kolonner' as sektion,
--          coalesce((select string_agg(column_name || ':' || data_type || ':' || is_nullable, ' · ' order by column_name)
--                      from information_schema.columns
--                     where table_schema = 'public' and table_name = 'milestones'
--                       and column_name in ('bekraeftet_at','bekraeftet_af')), 'findes ikke') as vaerdi
--   union all
--   select '2 tabel maal_kvartalstjek', count(*)::text from information_schema.tables
--    where table_schema = 'public' and table_name = 'maal_kvartalstjek'
--   union all
--   select '3 source ' || source || ' · ' || status, count(*)::text from public.milestones group by source, status
--   union all
--   select '4 milestones i alt', count(*)::text from public.milestones
--   union all
--   select '5 backfill rammer', count(*)::text from public.milestones m
--    where m.source = 'manual'
--      and exists (select 1 from public.company_members cm where cm.company_id = m.company_id and cm.user_id = m.user_id)
--   union all
--   select '6 manual uden medlemskab', count(*)::text from public.milestones m
--    where m.source = 'manual'
--      and not exists (select 1 from public.company_members cm where cm.company_id = m.company_id and cm.user_id = m.user_id)
--   union all
--   select '7 politik milestones ' || p.polname,
--          p.polcmd::text || ' · ' || case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end
--          || ' · USING=' || coalesce(pg_get_expr(p.polqual, p.polrelid), '—')
--          || ' · WITH CHECK=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '—')
--     from pg_policy p where p.polrelid = 'public.milestones'::regclass
--   union all
--   select '8 triggere milestones', string_agg(tgname, ' · ' order by tgname)
--     from pg_trigger where tgrelid = 'public.milestones'::regclass and not tgisinternal
--   order by 1;
--   Forventet: 1 = «findes ikke»; 2 = 0; 3 = fordelingen (SKRIV DEN HER — Jonas' tal 1/10:
--   29 af 36 aktive er agent/ai/handout); 5 = antallet, backfillen sætter; 6 = 'manual'-mål
--   skrevet af en, der ikke er medlem af virksomheden (forbliver ubekræftede — læs dem,
--   før du kører: er de en rådgivers, er det rigtigt); 7 = de 10 politikker som i
--   20261001190000 (ingen rørt her); 8 = update_milestones_updated_at ·
--   milestone_progress_updated_at · milestone_completed_at · milestones_hoejst_tre_aktive.
--   Afviger 7 eller 8 fra det kendte — STOP og læs, før migrationen køres.
--
-- EFTER-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonner' as sektion,
--          coalesce((select string_agg(column_name || ':' || data_type || ':' || is_nullable, ' · ' order by column_name)
--                      from information_schema.columns
--                     where table_schema = 'public' and table_name = 'milestones'
--                       and column_name in ('bekraeftet_at','bekraeftet_af')), 'findes ikke') as vaerdi
--   union all
--   select '2 bekraeftede', count(*)::text from public.milestones where bekraeftet_at is not null
--   union all
--   select '3 bekraeftede = created_at', count(*)::text from public.milestones where bekraeftet_at = created_at
--   union all
--   select '4 ubekraeftede aktive pr. source', coalesce(string_agg(source || ':' || n, ' · ' order by source), 'ingen')
--     from (select source, count(*) n from public.milestones where bekraeftet_at is null and status = 'active' group by source) t
--   union all
--   select '5 tabel maal_kvartalstjek rls', (select rowsecurity::text from pg_tables where schemaname = 'public' and tablename = 'maal_kvartalstjek')
--   union all
--   select '6 politik kvartalstjek ' || p.polname,
--          p.polcmd::text || ' · ' || case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end
--          || ' · USING=' || coalesce(pg_get_expr(p.polqual, p.polrelid), '—')
--          || ' · WITH CHECK=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '—')
--     from pg_policy p where p.polrelid = 'public.maal_kvartalstjek'::regclass
--   union all
--   select '7 kvartalstjek rækker', count(*)::text from public.maal_kvartalstjek
--   union all
--   select '8 privilegier kvartalstjek',
--          coalesce((select string_agg(grantee || ':' || privilege_type, ' · ' order by grantee, privilege_type)
--                      from information_schema.table_privileges
--                     where table_schema = 'public' and table_name = 'maal_kvartalstjek'
--                       and grantee in ('anon','authenticated')), 'ingen')
--   union all
--   select '9 politik milestones antal', count(*)::text from pg_policy where polrelid = 'public.milestones'::regclass
--   order by 1;
--   Forventet: 1 = «bekraeftet_af:uuid:YES · bekraeftet_at:timestamp with time zone:YES»;
--   2 = FØR sektion 5; 3 = samme tal som 2; 4 = kun handout/legat/advisor/agent/ai (ingen
--   'manual' med medlemskab); 5 = true; 6 = tre rækker (medlem SELECT, medlem INSERT,
--   rådgiver SELECT), alle PERMISSIVE; 7 = 0; 8 = authenticated:INSERT · authenticated:SELECT
--   (intet til anon); 9 = 10 (uændret).
--
-- RUL TILBAGE (kun før Update):
--   DROP TABLE IF EXISTS public.maal_kvartalstjek;
--   ALTER TABLE public.milestones DROP COLUMN IF EXISTS bekraeftet_af, DROP COLUMN IF EXISTS bekraeftet_at;
--   (backfillen ruller med kolonnen — ingen anden række er rørt.)

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS bekraeftet_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS bekraeftet_af uuid NULL;

COMMENT ON COLUMN public.milestones.bekraeftet_at IS
  'Dine mål skive 3 (2/10-2026): hvornår medlemmet bekræftede målet («Det er vores mål»/«Behold»). NULL = forslag/ubekræftet — tæller ikke i pladser, Score eller forsidens fokus (src/lib/hjemmebane/maalBekraeft.ts). Backfill: source = manual + medlem af virksomheden → created_at.';
COMMENT ON COLUMN public.milestones.bekraeftet_af IS
  'Hvem bekræftede (auth.uid() i klienten). Backfill: user_id.';

-- Backfill: kun medlemmets egne (se filhovedet). Guardet på bekraeftet_at IS NULL.
UPDATE public.milestones m
   SET bekraeftet_at = m.created_at,
       bekraeftet_af = m.user_id
 WHERE m.bekraeftet_at IS NULL
   AND m.source = 'manual'
   AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = m.company_id AND cm.user_id = m.user_id);

CREATE TABLE IF NOT EXISTS public.maal_kvartalstjek (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id  uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kvartal       smallint NOT NULL CHECK (kvartal IN (1, 2, 3)),
  valg          text NOT NULL CHECK (valg IN ('behold', 'justeret', 'parkeret', 'naaet')),
  valgt_af      uuid NOT NULL DEFAULT auth.uid(),
  valgt_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (milestone_id, kvartal)
);

COMMENT ON TABLE public.maal_kvartalstjek IS
  'Kvartalstjekket på Dine mål (skive 3, 2/10-2026): medlemmets svar i måned 3, 6 og 9 efter bekræftelsen — behold · justeret · parkeret · naaet. Én række pr. (mål, kvartal); et registreret tjek dækker de tidligere. Append-only. Dommen: src/lib/hjemmebane/maalBekraeft.ts.';

CREATE INDEX IF NOT EXISTS maal_kvartalstjek_company_idx ON public.maal_kvartalstjek (company_id);

ALTER TABLE public.maal_kvartalstjek ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.maal_kvartalstjek FROM anon;
REVOKE ALL ON public.maal_kvartalstjek FROM authenticated;
GRANT SELECT, INSERT ON public.maal_kvartalstjek TO authenticated;

-- DROP POLICY IF EXISTS herunder: KUN for idempotens på en tabel, denne
-- migration selv opretter — ingen eksisterende policy fjernes.

DROP POLICY IF EXISTS "Company members can view company kvartalstjek" ON public.maal_kvartalstjek;
CREATE POLICY "Company members can view company kvartalstjek"
  ON public.maal_kvartalstjek FOR SELECT TO authenticated
  USING (company_id = public.user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Company members can insert company kvartalstjek" ON public.maal_kvartalstjek;
CREATE POLICY "Company members can insert company kvartalstjek"
  ON public.maal_kvartalstjek FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.user_company_id(auth.uid())
    AND valgt_af = auth.uid()
    AND EXISTS (SELECT 1 FROM public.milestones m WHERE m.id = milestone_id AND m.company_id = maal_kvartalstjek.company_id)
  );

DROP POLICY IF EXISTS "Advisors can view all kvartalstjek" ON public.maal_kvartalstjek;
CREATE POLICY "Advisors can view all kvartalstjek"
  ON public.maal_kvartalstjek FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));
