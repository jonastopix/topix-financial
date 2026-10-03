-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (RLS-stramning, WITH CHECK på 15 UPDATE-politikker + 5 INSERT — g03-with-check-15-politikker).
--
-- Første linje er med vilje IKKE «-- IKKE KØRT. DEPLOY: …» (samme form som 20261002280000_milestones_with_check).
-- Ændrer eksisterende RLS-politikker → CLAUDE.md «FORBIDDEN uden eksplicit grønt lys».
-- KUN «ALTER POLICY … WITH CHECK (…)»: USING, roller og PERMISSIVE røres ikke; ingen DROP, ingen
-- CREATE, ingen funktion ændres (user_company_id læses kun). milestones står IKKE her — de fire
-- milestones-politikker er 20261002280000 (maalSkriv.guard dom 2 forbyder andre filer at røre dem).
-- Værn: src/lib/__tests__/revokeAnon.guard.test.ts (dom 4).
--
-- MÅLT I PROD 3/10-2026 (pg_policy, schema public, polcmd UPDATE eller ALL, polwithcheck IS NULL):
--   35 politikker uden WITH CHECK. 18 er rådgiver-/service-politikker (USING = has_role(…advisor)
--   eller auth.role() = 'service_role') — de røres ikke: uden WITH CHECK bruger Postgres USING som
--   check, og en rådgiver må i forvejen skrive alt. 2 er milestones (20261002280000). De 15 er her.
--   Forudsætningen «ingen bruger i flere virksomheder» (user_company_id tager ÉN række): målt 0.
--
-- DEN VIGTIGSTE MÅLING — og en RETTELSE af kortet (målt, ikke antaget): «WITH CHECK = det samme som
-- USING» ÆNDRER INTET. Uden WITH CHECK bruger Postgres allerede USING som check på den nye række
-- (CREATE POLICY-dokumentationen). Hullet er ikke den manglende linje, men at USING på FIRE af de
-- 15 KUN dømmer ejeren (user_id/member_id), ikke virksomheden — og da UPDATE-politikker er
-- PERMISSIVE og OR'es, er den nye række lovlig, så snart ÉN af dem siger ja. Et medlem kan derfor
-- i dag sætte company_id på sin egen rapport/KPI-mål/benchmark/samtale til en fremmed virksomhed
-- gennem «Users can update own …»/«Members can update own conversation», og koble sit handout til
-- et fremmed mål gennem «Users can update own lever milestones». Kortets «kan flytte egen række på
-- 17 politikker» passer derfor kun på 4 + 1 (+ milestones' «Users can update own»); på de
-- virksomhedsbundne («Company members can update …») holder den implicitte check allerede.
-- Derfor to grupper:
--
-- GRUPPE A — LUKKER HULLET (5 UPDATE): WITH CHECK = USING OG virksomheden.
--   1. financial_reports  «Users can update own reports» (authenticated)   USING (auth.uid() = user_id)
--   2. kpi_targets        «Users can update own kpi targets» (PUBLIC)      USING (auth.uid() = user_id)
--   3. kpi_benchmarks     «Users can update own benchmarks» (PUBLIC)       USING (auth.uid() = user_id)
--   4. conversations      «Members can update own conversation» (PUBLIC)   USING (auth.uid() = member_id)
--   5. handout_lever_milestones «Users can update own lever milestones» (PUBLIC)
--                         USING (EXISTS handouts h: h.id = handout_id AND h.user_id = auth.uid())
--      → + EXISTS (milestones m: m.id = milestone_id AND m.company_id = user_company_id(auth.uid()))
--   SIKKERT? Målt 3/10: rækker, hvis ejer er medlem, men hvis company_id ≠ ejerens virksomhed:
--   financial_reports 0 (af 446) · kpi_targets 0 (af 16) · kpi_benchmarks 0 (af 48) ·
--   conversations 0 (af 28; company_id null: 0) · handout_lever_milestones med mål i en anden
--   virksomhed end handoutets: 0 (af 24; milestone_id er NOT NULL). Rækker med en ejer, der IKKE er
--   medlem: financial_reports 57 — alle 57 ejes af rådgivere, som skriver gennem «Advisors can
--   update financial reports» (OR'es) og derfor ikke rammes; kpi_targets/kpi_benchmarks/
--   conversations 0. Klientens skrivninger: ingen insert i conversations fra src/ (oprettes på
--   serveren); rapporter, KPI-mål og benchmarks skrives med medlemmets egen company_id.
--
-- GRUPPE A' — SAMME HUL GENNEM INSERT (5, IKKE blandt de 15 — kan strøges, men uden dem er
--   gruppe A kosmetik: medlemmet INSERT'er bare rækken direkte i den fremmede virksomhed):
--   financial_reports «Users can insert own reports» · kpi_benchmarks «Users can insert own
--   benchmarks» · kpi_targets «Users can insert own kpi targets» · conversations «Members can
--   create own conversation» · handout_lever_milestones «Users can insert own lever milestones».
--   Samme form som 20261002280000 («Users can insert own milestones»).
--
-- GRUPPE B — EKSPLICIT = USING (10 UPDATE, INGEN adfærdsændring): USING binder allerede
--   virksomheden eller personen, så den implicitte check holder. Linjen skrives, så politikken
--   kan læses alene, og så en senere ændring af USING (fx a22-rls-initplan) ikke stille ændrer
--   checken med. Ikke en sikkerhedsrettelse, og den står her kun, fordi kortet bad om den:
--   budget_targets «Users can update company budgets» (company ELLER rådgiver/admin) ·
--   companies «Members can update own company» (id; kolonneværnet forbyder også id) ·
--   company_invitations «Company members can update company invitations» ·
--   conversations «Company members can update company conversations» ·
--   financial_reports «Company members can update company reports» ·
--   kpi_benchmarks «Company members can update company benchmarks» ·
--   kpi_targets «Company members can update company kpi targets» ·
--   kpi_chart_comments «Advisors can update own kpi_chart_comments» (forfatter OG rådgiver) ·
--   profiles «Users can update own profile» (user_id; tabellen har ingen company_id) ·
--   conversation_last_seen «Users can update own last_seen» (user_id; conversation_id kan peges
--     på en anden samtale, men rækken er brugerens EGEN læst-markør — ingen skade; ikke strammet).
--
-- IKKE RØRT, MED GRUND: de 18 rådgiver-/service-politikker (ovenfor) · milestones (egen fil) ·
--   «Users can update own handouts» HAR allerede WITH CHECK med company_id.
--
-- RÆKKEFØLGEN (ét skridt ad gangen):
--   1. Jonas' grønne lys (og gerne 20261002280000 i samme vindue — samme mønster).
--   2. FØR-SQL (gem CSV — USING/WITH CHECK er tilbagerulningens værdier).
--   3. TØRKØRSEL (DO-blok nedenfor): ALTER'erne + en negativ og en positiv prøve som et rigtigt
--      medlem — svarer ALTID med en fejl «TØRKØRSEL …» og ruller tilbage.
--   4. KØR denne fil i Lovable → SQL editor.
--   5. EFTER-SQL (gem CSV).
--   6. Livetjek som medlem: upload/godkend en rapport, ret et KPI-mål, skriv i chatten, koble et
--      handout til et mål; som rådgiver: ret en rapport og et KPI-mål på en virksomhed.
--   7. Flip første linje til «-- KØRT i prod …»; ajourfør SECURITY_BASELINE §5 og kortet.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select c.relname || ' · ' || p.polname as politik, p.polcmd::text as cmd,
--          coalesce((select string_agg(r.rolname, ',') from pg_roles r where r.oid = any (p.polroles)), 'PUBLIC') as roller,
--          coalesce(pg_get_expr(p.polqual, p.polrelid), '—') as using_,
--          coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '—') as with_check
--     from pg_policy p join pg_class c on c.oid = p.polrelid
--    where c.relnamespace = 'public'::regnamespace
--      and (c.relname, p.polname) in (
--        ('financial_reports','Users can update own reports'), ('kpi_targets','Users can update own kpi targets'),
--        ('kpi_benchmarks','Users can update own benchmarks'), ('conversations','Members can update own conversation'),
--        ('handout_lever_milestones','Users can update own lever milestones'),
--        ('financial_reports','Users can insert own reports'), ('kpi_benchmarks','Users can insert own benchmarks'),
--        ('kpi_targets','Users can insert own kpi targets'), ('conversations','Members can create own conversation'),
--        ('handout_lever_milestones','Users can insert own lever milestones'),
--        ('budget_targets','Users can update company budgets'), ('companies','Members can update own company'),
--        ('company_invitations','Company members can update company invitations'),
--        ('conversations','Company members can update company conversations'),
--        ('financial_reports','Company members can update company reports'),
--        ('kpi_benchmarks','Company members can update company benchmarks'),
--        ('kpi_targets','Company members can update company kpi targets'),
--        ('kpi_chart_comments','Advisors can update own kpi_chart_comments'),
--        ('profiles','Users can update own profile'), ('conversation_last_seen','Users can update own last_seen'))
--   union all
--   select 'brugere i flere virksomheder', '', '', '',
--          (select count(*) from (select user_id from public.company_members group by user_id having count(distinct company_id) > 1) x)::text
--   order by 1;
--   Forventet (målt 3/10): 20 politikrækker; de 15 UPDATE med with_check «—», de 5 INSERT med
--   with_check «(auth.uid() = user_id)»/«(auth.uid() = member_id)»/«(EXISTS … handouts …)»;
--   «brugere i flere virksomheder» = 0 (ellers STOP).
--
-- TØRKØRSEL (Lovable → SQL editor; ændrer intet — slutter ALTID med RAISE EXCEPTION). Den finder
-- selv et medlem med en rapport og en anden virksomhed, prøver at FLYTTE rapporten FØR og EFTER
-- ALTER'erne (hver prøve i sin egen underblok, som rulles tilbage), og prøver en lovlig no-op:
--   do $$
--   declare
--     medlem uuid; rapport uuid; egen uuid; fremmed uuid; n int; foer text; efter text; lovlig text;
--   begin
--     select r.user_id, r.id, r.company_id into medlem, rapport, egen
--       from public.financial_reports r join public.company_members cm on cm.user_id = r.user_id and cm.company_id = r.company_id
--      where r.deleted_at is null and not exists (select 1 from public.user_roles ur where ur.user_id = r.user_id and ur.role in ('advisor', 'admin'))
--      limit 1;
--     select id into fremmed from public.companies where id <> egen limit 1;
--     if medlem is null or fremmed is null then raise exception 'TØRKØRSEL STOP: intet prøvemedlem fundet'; end if;
--     perform set_config('request.jwt.claims', json_build_object('sub', medlem, 'role', 'authenticated')::text, true);
--     perform set_config('request.jwt.claim.sub', medlem::text, true);
--     -- FØR: flytningen skal LYKKES (det er hullet) — rulles tilbage af underblokken
--     begin
--       set local role authenticated;
--       update public.financial_reports set company_id = fremmed where id = rapport;
--       get diagnostics n = row_count; foer := 'lykkedes ' || n;
--       raise exception using errcode = 'P0001', message = 'rul';
--     exception when sqlstate 'P0001' then null;
--               when others then foer := 'FEJL ' || sqlstate;
--     end;
--     reset role;
--     -- ALTER'erne — ORDRET filens krop (de 20; værnet revokeAnon.guard dom 4 holder dem ens):
--     ALTER POLICY "Users can update own reports" ON public.financial_reports
--     WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Users can update own kpi targets" ON public.kpi_targets
--     WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Users can update own benchmarks" ON public.kpi_benchmarks
--     WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Members can update own conversation" ON public.conversations
--     WITH CHECK (auth.uid() = member_id AND company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Users can update own lever milestones" ON public.handout_lever_milestones
--     WITH CHECK (
--     EXISTS (SELECT 1 FROM public.handouts
--     WHERE handouts.id = handout_lever_milestones.handout_id AND handouts.user_id = auth.uid())
--     AND EXISTS (SELECT 1 FROM public.milestones m
--     WHERE m.id = handout_lever_milestones.milestone_id
--     AND m.company_id = public.user_company_id(auth.uid()))
--     );
--     ALTER POLICY "Users can insert own reports" ON public.financial_reports
--     WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Users can insert own benchmarks" ON public.kpi_benchmarks
--     WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Users can insert own kpi targets" ON public.kpi_targets
--     WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Members can create own conversation" ON public.conversations
--     WITH CHECK (auth.uid() = member_id AND company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Users can insert own lever milestones" ON public.handout_lever_milestones
--     WITH CHECK (
--     EXISTS (SELECT 1 FROM public.handouts
--     WHERE handouts.id = handout_lever_milestones.handout_id AND handouts.user_id = auth.uid())
--     AND EXISTS (SELECT 1 FROM public.milestones m
--     WHERE m.id = handout_lever_milestones.milestone_id
--     AND m.company_id = public.user_company_id(auth.uid()))
--     );
--     ALTER POLICY "Users can update company budgets" ON public.budget_targets
--     WITH CHECK ((company_id = public.user_company_id(auth.uid())) OR public.has_role(auth.uid(), 'advisor'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
--     ALTER POLICY "Members can update own company" ON public.companies
--     WITH CHECK (id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Company members can update company invitations" ON public.company_invitations
--     WITH CHECK (company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Company members can update company conversations" ON public.conversations
--     WITH CHECK (company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Company members can update company reports" ON public.financial_reports
--     WITH CHECK (company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Company members can update company benchmarks" ON public.kpi_benchmarks
--     WITH CHECK (company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Company members can update company kpi targets" ON public.kpi_targets
--     WITH CHECK (company_id = public.user_company_id(auth.uid()));
--     ALTER POLICY "Advisors can update own kpi_chart_comments" ON public.kpi_chart_comments
--     WITH CHECK ((auth.uid() = author_id) AND public.has_role(auth.uid(), 'advisor'::app_role));
--     ALTER POLICY "Users can update own profile" ON public.profiles
--     WITH CHECK (auth.uid() = user_id);
--     ALTER POLICY "Users can update own last_seen" ON public.conversation_last_seen
--     WITH CHECK (user_id = auth.uid());
--     -- EFTER: flytningen skal AFVISES med 42501
--     begin
--       set local role authenticated;
--       update public.financial_reports set company_id = fremmed where id = rapport;
--       get diagnostics n = row_count; efter := 'lykkedes ' || n;
--       raise exception using errcode = 'P0001', message = 'rul';
--     exception when sqlstate 'P0001' then null;
--               when others then efter := 'FEJL ' || sqlstate;
--     end;
--     reset role;
--     -- EFTER: en lovlig skrivning i egen virksomhed skal LYKKES (1 række)
--     begin
--       set local role authenticated;
--       update public.financial_reports set company_id = egen where id = rapport;
--       get diagnostics n = row_count; lovlig := 'lykkedes ' || n;
--       raise exception using errcode = 'P0001', message = 'rul';
--     exception when sqlstate 'P0001' then null;
--               when others then lovlig := 'FEJL ' || sqlstate;
--     end;
--     reset role;
--     raise exception 'TØRKØRSEL % | før: % | efter: % | lovlig: %',
--       case when foer = 'lykkedes 1' and efter = 'FEJL 42501' and lovlig = 'lykkedes 1' then 'OK' else 'STOP' end,
--       foer, efter, lovlig;
--   end $$;
--   Forventet: «ERROR: TØRKØRSEL OK | før: lykkedes 1 | efter: FEJL 42501 | lovlig: lykkedes 1».
--   «før: FEJL …» betyder, at hullet ikke findes som antaget (fx en trigger, der afviser): STOP og
--   læs fejlen — så er gruppe A unødvendig for den tabel, og det skal bogføres.
--
-- EFTER-SQL: FØR-SQL'en igen. Forventet: gruppe A's 10 med with_check som i kroppen nedenfor;
--   gruppe B's 10 med with_check = using_ tegn for tegn; using_ og roller uændret på alle 20.
--
-- RUL TILBAGE (ALTER POLICY kan ikke FJERNE en WITH CHECK; den sættes til USING, hvilket er
-- Postgres' egen betydning af en manglende — for gruppe B er det præcis det, filen satte):
--   ALTER POLICY "Users can update own reports" ON public.financial_reports WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY "Users can update own kpi targets" ON public.kpi_targets WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY "Users can update own benchmarks" ON public.kpi_benchmarks WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY "Members can update own conversation" ON public.conversations WITH CHECK (auth.uid() = member_id);
--   ALTER POLICY "Users can update own lever milestones" ON public.handout_lever_milestones
--     WITH CHECK (EXISTS (SELECT 1 FROM public.handouts WHERE handouts.id = handout_lever_milestones.handout_id AND handouts.user_id = auth.uid()));
--   ALTER POLICY "Users can insert own reports" ON public.financial_reports WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY "Users can insert own benchmarks" ON public.kpi_benchmarks WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY "Users can insert own kpi targets" ON public.kpi_targets WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY "Members can create own conversation" ON public.conversations WITH CHECK (auth.uid() = member_id);
--   ALTER POLICY "Users can insert own lever milestones" ON public.handout_lever_milestones
--     WITH CHECK (EXISTS (SELECT 1 FROM public.handouts WHERE handouts.id = handout_lever_milestones.handout_id AND handouts.user_id = auth.uid()));
--   (Gruppe B behøver ingen tilbagerulning: den satte WITH CHECK = USING = den implicitte.)
--   (De to handout_lever_milestones-udtryk er målt ORDRET i pg_policy 3/10.)

-- ── GRUPPE A: lukker hullet (UPDATE) ───────────────────────────────────────────
ALTER POLICY "Users can update own reports" ON public.financial_reports
  WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Users can update own kpi targets" ON public.kpi_targets
  WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Users can update own benchmarks" ON public.kpi_benchmarks
  WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Members can update own conversation" ON public.conversations
  WITH CHECK (auth.uid() = member_id AND company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Users can update own lever milestones" ON public.handout_lever_milestones
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.handouts
             WHERE handouts.id = handout_lever_milestones.handout_id AND handouts.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.milestones m
                 WHERE m.id = handout_lever_milestones.milestone_id
                   AND m.company_id = public.user_company_id(auth.uid()))
  );

-- ── GRUPPE A': samme hul gennem INSERT (ikke blandt de 15 — se filhovedet) ─────
ALTER POLICY "Users can insert own reports" ON public.financial_reports
  WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Users can insert own benchmarks" ON public.kpi_benchmarks
  WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Users can insert own kpi targets" ON public.kpi_targets
  WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Members can create own conversation" ON public.conversations
  WITH CHECK (auth.uid() = member_id AND company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Users can insert own lever milestones" ON public.handout_lever_milestones
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.handouts
             WHERE handouts.id = handout_lever_milestones.handout_id AND handouts.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.milestones m
                 WHERE m.id = handout_lever_milestones.milestone_id
                   AND m.company_id = public.user_company_id(auth.uid()))
  );

-- ── GRUPPE B: eksplicit = USING (ingen adfærdsændring) ─────────────────────────
ALTER POLICY "Users can update company budgets" ON public.budget_targets
  WITH CHECK ((company_id = public.user_company_id(auth.uid())) OR public.has_role(auth.uid(), 'advisor'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Members can update own company" ON public.companies
  WITH CHECK (id = public.user_company_id(auth.uid()));

ALTER POLICY "Company members can update company invitations" ON public.company_invitations
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Company members can update company conversations" ON public.conversations
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Company members can update company reports" ON public.financial_reports
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Company members can update company benchmarks" ON public.kpi_benchmarks
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Company members can update company kpi targets" ON public.kpi_targets
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

ALTER POLICY "Advisors can update own kpi_chart_comments" ON public.kpi_chart_comments
  WITH CHECK ((auth.uid() = author_id) AND public.has_role(auth.uid(), 'advisor'::app_role));

ALTER POLICY "Users can update own profile" ON public.profiles
  WITH CHECK (auth.uid() = user_id);

ALTER POLICY "Users can update own last_seen" ON public.conversation_last_seen
  WITH CHECK (user_id = auth.uid());
