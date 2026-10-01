-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (RLS-stramning, SECURITY_BASELINE fund 6).
--
-- FORBEREDT 1/10-2026 aften (det tekniske råds fund 9 på «Dine mål»-motoren).
-- KØRES IKKE uden Jonas' udtrykkelige ja: den ændrer eksisterende RLS-politikker
-- (CLAUDE.md «FORBIDDEN uden eksplicit grønt lys»). Første linje er med vilje IKKE
-- «IKKE KØRT. DEPLOY: …» — den, der scanner mappen efter migrationer at køre, skal
-- ikke tage denne med. Kildeværnet maalSkriv.guard dom 2 tillader filen KUN i
-- denne form (forberedtStramning: første linje, kun ALTER POLICY, kun stramning).
--
-- HVAD (SECURITY_BASELINE fund 6, ÅBENT siden 29/9): medlemmets INSERT/UPDATE-
-- politikker på public.milestones får en WITH CHECK på virksomheden:
--   «Users can insert own milestones»             WITH CHECK (auth.uid() = user_id)
--      → WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()))
--   «Users can update own milestones»             USING (auth.uid() = user_id), ingen WITH CHECK
--      → WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()))
--   «Company members can insert company milestones» WITH CHECK (company_id = user_company_id(auth.uid()))
--      → uændret i indhold; skrevet eksplicit, så alle fire står ens
--   «Company members can update company milestones» USING (company_id = …), ingen WITH CHECK
--      → WITH CHECK (company_id = public.user_company_id(auth.uid()))
-- USING røres IKKE (ALTER POLICY … WITH CHECK ændrer kun WITH CHECK). Ingen DROP,
-- ingen CREATE, ingen SECURITY DEFINER-funktion ændres (user_company_id læses kun).
--
-- HVORFOR (forstærket 1/10 aften): politikkerne er PERMISSIVE og stakker med OR.
-- «Users can … own milestones» dømmer KUN user_id, og uden WITH CHECK bruger
-- Postgres USING som WITH CHECK — dvs. auth.uid() = user_id. Et medlem kan derfor
-- INSERT'e (eller UPDATE'e sit eget mål til) en række med en ANDEN virksomheds
-- company_id, så længe user_id er hans eget. Med «Dine mål» får det to følger:
--   1. målet står på den ANDEN virksomheds forside og i «Dine mål» (hentningen
--      filtrerer på company_id, hooks/dineMaalGrundlag.ts:hentMaalMedTal), og
--   2. triggeren milestones_hoejst_tre_aktive tæller pr. company_id — TRE
--      fremmede aktive mål blokerer offerets egne («Du har allerede 3 aktive mål»).
--
-- KENDT FORBEHOLD (baselinens egen grund til at vente): user_company_id tager ÉN
-- vilkårlig række (LIMIT 1), og company_members er ikke unik på user_id. Et medlem
-- i TO virksomheder ville efter stramningen kun kunne skrive mål i den ene.
-- FØR-SQL sektion 2 måler, hvor mange brugere det gælder, og sektion 3, hvor mange
-- eksisterende mål der står uden for skribentens virksomhed. Er 2 > 0, STOP og
-- vælg med Jonas (fx en company_members-baseret EXISTS i stedet for user_company_id).
--
-- POLITIKNAVNENE er læst i migrationshistorikken (20260223155456:22–23,
-- 20260224222456:192/196) — de SKAL MÅLES i pg_policy før kørsel (FØR-SQL
-- sektion 1). Findes et navn ikke, fejler ALTER POLICY, og transaktionen ruller
-- tilbage — men STOP hellere før.
--
-- RÆKKEFØLGEN (ét skridt ad gangen):
--   1. Jonas' grønne lys.
--   2. FØR-SQL (gem CSV). Sektion 1 skal vise de fire navne; sektion 2 skal være 0.
--   3. KØR denne migration i Lovable → SQL editor.
--   4. EFTER-SQL (gem CSV).
--   5. Prøv som medlem: et mål i egen virksomhed oprettes; et mål med en fremmed
--      company_id afvises med 42501 (new row violates row-level security policy).
--   6. Flip første linje til «-- KØRT i prod …» og ajourfør maalSkriv.guard dom 2 +
--      SECURITY_BASELINE fund 6 i samme PR.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 politik ' || p.polname as sektion,
--          p.polcmd || ' · ' || case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end
--          || ' · roller=' || coalesce((select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r where r.oid = any (p.polroles)), 'public')
--          || ' · USING=' || coalesce(pg_get_expr(p.polqual, p.polrelid), '—')
--          || ' · WITH CHECK=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '—') as vaerdi
--     from pg_policy p where p.polrelid = 'public.milestones'::regclass
--   union all
--   select '2 brugere i flere virksomheder', count(*)::text
--     from (select user_id from public.company_members group by user_id having count(distinct company_id) > 1) x
--   union all
--   select '3 mål uden for skribentens virksomhed', count(*)::text
--     from public.milestones m
--    where not exists (select 1 from public.company_members cm where cm.user_id = m.user_id and cm.company_id = m.company_id)
--   union all
--   select '4 milestones i alt', count(*)::text from public.milestones
--   order by 1;
--   Forventet: 1 = blandt andet de fire navne ovenfor (gem USING/WITH CHECK — de er
--   tilbagerulningens værdier); 2 = 0; 3 = 0 (ellers: læs rækkerne, før der strammes).
--
-- EFTER-SQL (ét resultatsæt — gem CSV):
--   select '1 politik ' || p.polname as sektion,
--          p.polcmd || ' · ' || case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end
--          || ' · roller=' || coalesce((select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r where r.oid = any (p.polroles)), 'public')
--          || ' · USING=' || coalesce(pg_get_expr(p.polqual, p.polrelid), '—')
--          || ' · WITH CHECK=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '—') as vaerdi
--     from pg_policy p where p.polrelid = 'public.milestones'::regclass
--   union all
--   select '2 milestones i alt', count(*)::text from public.milestones
--   order by 1;
--   Forventet: de fire politikker med WITH CHECK som ovenfor; USING, roller og
--   PERMISSIVE uændret fra FØR; de øvrige politikker uændret; 2 = som FØR (4).
--
-- RUL TILBAGE (sæt WITH CHECK tilbage til FØR-værdierne; «Users can update own» og
-- «Company members can update company» havde INGEN WITH CHECK — ALTER POLICY kan
-- ikke fjerne en WITH CHECK, så den sættes til samme udtryk som USING, hvilket er
-- Postgres' egen betydning af en manglende WITH CHECK):
--   ALTER POLICY "Users can insert own milestones" ON public.milestones
--     WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY "Users can update own milestones" ON public.milestones
--     WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY "Company members can insert company milestones" ON public.milestones
--     WITH CHECK (company_id = public.user_company_id(auth.uid()));
--   ALTER POLICY "Company members can update company milestones" ON public.milestones
--     WITH CHECK (company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Users can insert own milestones" ON public.milestones
  WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Users can update own milestones" ON public.milestones
  WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Company members can insert company milestones" ON public.milestones
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Company members can update company milestones" ON public.milestones
  WITH CHECK (company_id = public.user_company_id(auth.uid()));
