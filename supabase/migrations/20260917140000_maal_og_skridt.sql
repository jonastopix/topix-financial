-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «Én plan pr. virksomhed» — FASE 1: datamodellen, uden fladeændringer
-- (16/9-2026; plan-en-plan.md §1a, §1b, §4 FASE 1). Jonas 16/9 (ordret):
-- «1. Ja 2. Enig med dig 3. Enig med dig» — én plan: milepælene bliver
-- «Dine mål» (højst tre aktive), opgaverne er skridt under et mål; når alle
-- skridt er gjort, rykker målets fremdrift.
--
-- ORDENE: «mål» = en milestones-række (tabellen beholder navnet); «skridt» =
-- en company_actions-række.
--
-- JONAS 16/9 (ordret) til 100 %-spørgsmålet: «A» — 100 % betyder at alle
-- skridt er gjort, og målet vises som færdigt; i fase 3 får fladen «Marker
-- som nået».
-- Derfor rører fremdriften aldrig målets status: 100 % er «alle skridt
-- gjort» (afgoerMilepael viser målet som færdigt ved progress >= 100),
-- «nået» er menneskets valg.
--
-- VALGET (plan §1a, afvejet igen 16/9): VEJ B — ny kolonne
-- company_actions.maal_id, IKKE source_type = 'milestone' + source_id.
--   source_type siger HVEM der foreslog (ai_weekly, agent, advisor, …) og
--   styrer udløbsfrist (_shared/opgaveUdloeb.ts) og prioritering
--   (aftaler.ts); source_id er en uuid uden FK. Et skridt foreslået af
--   agenten MOD et mål kan ikke bære begge i ét felt. maal_id er én akse:
--   HVAD skridtet hører til. 'milestone' bliver stående i source_type-
--   CHECK'en som død værdi (ryddes i fase 2 sammen med resten).
--   ON DELETE SET NULL, ikke CASCADE: et slettet mål må ikke slette historik
--   (Jonas: «fuldførte skridt bliver stående som historik»).
--
-- INDEKSET er (maal_id) WHERE maal_id IS NOT NULL — ikke planens
--   «where status in ('proposed','active')»: fremdriften regnes af ALLE
--   skridt under målet (done/not_done/dropped/active), så det er dén
--   forespørgsel (opgave-luk) indekset skal bære.
--
-- milestones.completed_at: MÅLT 16/9 — findes IKKE (git grep i
--   supabase/migrations: ingen «completed_at» på milestones; types.ts
--   milestones.Row har ingen). Tilføjes som timestamptz NULL. Sættes af en
--   NY trigger (ikke af skriverne — fase 1 rører ingen flade, og medlemmet
--   sætter status = 'completed' direkte fra klienten i dag,
--   useMilestones.ts:182-185): når status bliver 'completed' → now(); når
--   status forlader 'completed' → NULL. Backfill: updated_at for rækker der
--   allerede står completed — et ESTIMAT (som progress_updated_at fik
--   updated_at i 20260407172908:8-10), bogført her.
--   Triggeren er NY, SET search_path = public, ikke SECURITY DEFINER, ikke
--   på auth.users — CLAUDE.md forbyder ÆNDRING af protect_*/auth-triggere;
--   en ny trigger på milestones er ikke nævnt, og siges derfor højt.
--
-- INGEN RLS-ÆNDRING: maal_id skrives kun af edge functions med service role
--   (company_actions har kun SELECT for klienter, 20260822224100:34-35);
--   milestones.progress skrives af opgave-luk med service role (bypass) —
--   medlemmets egne UPDATE-politikker (20260224222456:192-202) er uændrede.
--   RLS-stramningen («rådgiveren sætter målene») er fase 2 og kræver grønt lys.
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 kolonner' as sektion, concat(table_name, '.', column_name) as noegle,
--          concat(data_type, ' | nullable ', is_nullable) as vaerdi
--     from information_schema.columns
--    where table_schema = 'public'
--      and ((table_name = 'company_actions' and column_name = 'maal_id')
--        or (table_name = 'milestones' and column_name = 'completed_at'))
--   union all
--   select '2 fk', conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.company_actions'::regclass and contype = 'f'
--   union all
--   select '3 indeks', indexname, indexdef
--     from pg_indexes where schemaname = 'public' and tablename = 'company_actions' and indexname like '%maal%'
--   union all
--   select '4 triggere milestones', tgname, pg_get_triggerdef(oid)
--     from pg_trigger where tgrelid = 'public.milestones'::regclass and not tgisinternal
--   union all
--   select '5 milestones', 'i alt | completed | completed uden completed_at',
--          concat(count(*), ' | ', count(*) filter (where status = 'completed'), ' | ',
--                 count(*) filter (where status = 'completed' and to_jsonb(m) ->> 'completed_at' is null))
--     from public.milestones m
--   union all
--   select '6 skridt', 'i alt | med maal_id', concat(count(*), ' | ', count(*) filter (where to_jsonb(a) ->> 'maal_id' is not null))
--     from public.company_actions a
--   union all
--   select '7 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 tom; sektion 2 kun company_actions_company_id_fkey,
--   company_actions_user_id_fkey, company_actions_proposed_by_fkey; sektion 3
--   tom; sektion 4 = update_milestones_updated_at, milestone_progress_updated_at;
--   sektion 5 = «N | 11 | 11» (prod 16/9 19:03: 11 completed); sektion 6 = «198 | 0».
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt. FACIT EFTER: sektion 1 = company_actions.maal_id
--   «uuid | nullable YES» og milestones.completed_at «timestamp with time zone
--   | nullable YES»; sektion 2 har company_actions_maal_id_fkey «FOREIGN KEY
--   (maal_id) REFERENCES milestones(id) ON DELETE SET NULL»; sektion 3 har
--   idx_company_actions_maal; sektion 4 har også milestone_completed_at;
--   sektion 5 = «N | 11 | 0»; sektion 6 uændret «198 | 0».
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK:
--   drop trigger if exists milestone_completed_at on public.milestones;
--   drop function if exists public.saet_milestone_completed_at();
--   drop index if exists public.idx_company_actions_maal;
--   alter table public.company_actions drop column if exists maal_id;
--   alter table public.milestones drop column if exists completed_at;

-- 1. Skridtet peger på sit mål.
alter table public.company_actions
  add column if not exists maal_id uuid references public.milestones(id) on delete set null;

create index if not exists idx_company_actions_maal
  on public.company_actions (maal_id) where maal_id is not null;

comment on column public.company_actions.maal_id is
  'Fase 1 (16/9-2026): det mål (milestones.id) skridtet hører til. NULL = intet mål (forslag fra før planen). ON DELETE SET NULL: historik bliver stående. Skrives kun af edge functions (foreslaa-opgave; fase 5: ugens fokus og agenten).';

-- 2. Målet får et tidsstempel for «nået».
alter table public.milestones
  add column if not exists completed_at timestamptz;

comment on column public.milestones.completed_at is
  'Fase 1 (16/9-2026): hvornår målet blev nået (status = completed). Sættes af triggeren milestone_completed_at; NULL når målet ikke er nået. Backfill 16/9: updated_at for rækker der allerede stod completed — et estimat.';

create or replace function public.saet_milestone_completed_at()
returns trigger as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    new.completed_at = now();
  elsif new.status <> 'completed' then
    new.completed_at = null;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists milestone_completed_at on public.milestones;
create trigger milestone_completed_at
  before update on public.milestones
  for each row execute function public.saet_milestone_completed_at();

-- Backfill (estimat, bogført i filhovedet): de rækker der allerede står
-- completed får updated_at som completed_at. Rører kun status = 'completed'
-- og kun hvor completed_at er NULL.
update public.milestones
   set completed_at = updated_at
 where status = 'completed' and completed_at is null;

select
  (select count(*) from public.company_actions where maal_id is not null) as skridt_med_maal,
  (select count(*) from public.milestones where status = 'completed') as maal_completed,
  (select count(*) from public.milestones where status = 'completed' and completed_at is null) as completed_uden_stempel;
