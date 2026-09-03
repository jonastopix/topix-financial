-- Fire «demo»-policies fra PERMISSIVE til RESTRICTIVE — bogføring af en
-- rettelse der ALLEREDE ER KØRT i prod 3/9 2026 kl. 22:48 (Lovable SQL
-- editor). Denne fil er den kanoniske historik; den kan køres igen efter en
-- genskabelse (idempotent: DROP POLICY IF EXISTS før hver CREATE).
--
-- ── BAGGRUND ────────────────────────────────────────────────────────────────
--
-- Fire policies med «demo» i navnet var PERMISSIVE, hvor de skulle have
-- været RESTRICTIVE. Postgres' default for CREATE POLICY er PERMISSIVE, og
-- permissive policies kombineres med OR: en række slipper igennem hvis
-- BARE ÉN permissive policy siger ja. En policy hvis første led er
-- «company_id <> demo» returnerer sand for ALT der ikke er demo — og
-- giver dermed adgang til alle andre virksomheders rækker i stedet for at
-- nægte adgang til demoens. Der fandtes nul restriktive policies i hele
-- public-skemaet (målt 3/9: 0 af 268), så intet trak adgangen tilbage.
--
-- De fire policies og kolonnen companies.is_demo findes IKKE i repoets
-- migrationer (grep på «Hide demo» og «is_demo» i supabase/migrations/
-- gav nul træffere 3/9) — de blev oprettet direkte i Lovable. Denne fil
-- er første gang de står i repoet, nu i den rigtige form.
--
-- ── MÅLT I PROD 3/9 kl. 22:46, FØR rettelsen ────────────────────────────────
--
-- Som et almindeligt medlem (bruger ee17a6b5-c9d5-4cb7-b589-89bf3f32b152,
-- tilknyttet én virksomhed), via set_config('request.jwt.claims', …) +
-- set local role authenticated:
--
--   kilde                    kunne se    ejede selv
--   companies                      38             1
--   milestones                    102             0
--   financial_report_facts        314             0
--   conversations                  35             1
--
-- Ethvert logget-ind medlem kunne altså læse alle virksomheders
-- regnskabstal og alle samtaler mellem rådgivere og kunder. Elleve brugere
-- har rollen member.
--
-- ── MÅLT I PROD 3/9 kl. 22:49, EFTER rettelsen ──────────────────────────────
--
-- Samme bruger, samme test: 1 / 0 / 0 / 1 — præcis det brugeren selv ejer.
-- Rådgiveradgangen er urørt: målt som advisor+admin (23e81de4):
-- 38 / 102 / 314 / 35, uændret.
--
-- Målt samtidig: demo-virksomheden FINDES IKKE længere — hverken
-- is_demo = true eller id a0de0000-0000-4000-8000-000000000001. De fire
-- policies beskytter altså noget der er slettet. De bevares alligevel, som
-- restriktive, så en genoprettet demo-virksomhed ikke lækker.
--
-- NOTE (ikke en fejl): Morten er advisor UDEN admin. Med den restriktive
-- form ville en demo-virksomhed være skjult for ham — første led er falsk
-- for demoen, han er ikke medlem af den, og han er ikke admin. Det er
-- policyens hensigt («from non-members», admin undtaget), og det er uden
-- praktisk betydning så længe der ikke findes en demo-virksomhed.
--
-- ── HVAD DER ÆNDRES ─────────────────────────────────────────────────────────
--
-- Udtrykkene nedenfor er ORDRET dem der blev kørt i prod. Det eneste der
-- ændres i forhold til de gamle policies er AS RESTRICTIVE. En restriktiv
-- policy kombineres med AND: rækken skal passere ALLE restriktive policies
-- OG mindst én permissive. De eksisterende permissive policies
-- («Members can view own conversation», «Advisors can view all …» osv.)
-- bærer stadig adgangen; de fire her kan kun tage den fra.
--
-- Deploy: kørt i prod 3/9 kl. 22:48. Ved genskabelse: kør hele filen i
-- Lovable → SQL editor, og verificér med SELECT'en nederst.

-- ── companies ──

drop policy if exists "Hide demo company from non-members" on public.companies;
create policy "Hide demo company from non-members"
  on public.companies
  as restrictive
  for select
  to authenticated
  using (
    is_demo = false
    or exists (select 1 from public.company_members cm where cm.company_id = companies.id and cm.user_id = auth.uid())
    or public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ── conversations ──

drop policy if exists "Hide demo conversations from non-members" on public.conversations;
create policy "Hide demo conversations from non-members"
  on public.conversations
  as restrictive
  for select
  to authenticated
  using (
    company_id <> 'a0de0000-0000-4000-8000-000000000001'::uuid
    or exists (select 1 from public.company_members cm where cm.company_id = conversations.company_id and cm.user_id = auth.uid())
    or public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ── financial_report_facts ──

drop policy if exists "Hide demo facts from non-members" on public.financial_report_facts;
create policy "Hide demo facts from non-members"
  on public.financial_report_facts
  as restrictive
  for select
  to authenticated
  using (
    company_id <> 'a0de0000-0000-4000-8000-000000000001'::uuid
    or exists (select 1 from public.company_members cm where cm.company_id = financial_report_facts.company_id and cm.user_id = auth.uid())
    or public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ── milestones ──

drop policy if exists "Hide demo milestones from non-members" on public.milestones;
create policy "Hide demo milestones from non-members"
  on public.milestones
  as restrictive
  for select
  to authenticated
  using (
    company_id <> 'a0de0000-0000-4000-8000-000000000001'::uuid
    or exists (select 1 from public.company_members cm where cm.company_id = milestones.company_id and cm.user_id = auth.uid())
    or public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ── VERIFIKATION (kør som SELECT bagefter; alle fire skal stå som RESTRICTIVE) ──
--
--   select tablename, policyname, permissive, cmd, roles
--   from pg_policies
--   where schemaname = 'public'
--     and policyname in (
--       'Hide demo company from non-members',
--       'Hide demo conversations from non-members',
--       'Hide demo facts from non-members',
--       'Hide demo milestones from non-members'
--     )
--   order by tablename;
--
-- Forventet: 4 rækker, permissive = 'RESTRICTIVE', cmd = 'SELECT',
-- roles = '{authenticated}'. Og som helhed:
--
--   select permissive, count(*) from pg_policies
--   where schemaname = 'public' group by permissive;
--
-- Forventet 3/9: RESTRICTIVE 4, PERMISSIVE 264.
