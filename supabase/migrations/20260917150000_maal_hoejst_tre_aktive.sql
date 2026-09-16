-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «Én plan pr. virksomhed» — FASE 2a: højst tre aktive mål pr. virksomhed,
-- håndhævet i DATABASEN (16/9-2026; plan-en-plan.md §1b). Jonas 16/9:
-- «1. Ja» — milepælene bliver «Dine mål», højst tre aktive.
--
-- VALGET (constraint vs. trigger): en tællende regel («højst tre rækker med
-- status = 'active' pr. company_id») kan Postgres ikke udtrykke som CHECK
-- eller UNIQUE (et delvist UNIQUE-indeks kan kun sige «højst ÉN»). Derfor en
-- BEFORE INSERT OR UPDATE-trigger — husets mønster protect_weekly_focus_
-- seen_only (20260911060000): SET search_path = public, IKKE SECURITY
-- DEFINER (den læser kun milestones, som skriveren allerede har adgang til;
-- for et medlem tæller RLS egen virksomheds rækker, for service role alle).
-- Motoren (_shared/maal.ts kanOpretteMaal) dømmer det samme FØR skrivningen
-- i maal-skriv; triggeren er andet lag, så to samtidige kald ikke giver fire.
--
-- DE 87 AKTIVE (prod 16/9 19:03, 14 kunder, seneste fremdrift 30/6): triggeren
-- rammer KUN rækker der BLIVER aktive (INSERT med status active, eller UPDATE
-- fra en anden status til active). En virksomhed med fem aktive beholder sine
-- fem; fremdrift på dem kan stadig skrives (status uændret → intet tjek);
-- men en sjette afvises. Rådgiveren gennemgår dem på virksomhedssiden
-- («Planen»: behold/parkér/nået) — ingen række parkeres af denne migration
-- (plan §1c: ikke uden et klik).
--
-- INGEN RLS-ÆNDRING i denne fil. Den står i 20260917160000 (grønt lys).
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 triggere' as sektion, tgname as noegle, pg_get_triggerdef(oid) as vaerdi
--     from pg_trigger where tgrelid = 'public.milestones'::regclass and not tgisinternal
--   union all
--   select '2 aktive pr. virksomhed', concat(count(*) filter (where n > 3), ' virksomheder over 3 | max ', max(n)), string_agg(concat(company_id, ':', n), ', ' order by n desc) filter (where n > 3)
--     from (select company_id, count(*) n from public.milestones where status = 'active' group by company_id) t
--   union all
--   select '3 status', status, count(*)::text from public.milestones group by status
--   union all
--   select '4 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 = update_milestones_updated_at, milestone_progress_updated_at,
--   milestone_completed_at (fase 1); sektion 2 = «N virksomheder over 3 | max M» — TALLET
--   SKRIVES HER (det er gennemgangens størrelse); sektion 3 = active 87 | completed 11 (16/9).
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt plus
--   select '5 proeve', 'fjerde aktive afvises', (select count(*)::text from public.milestones where false)
--   — og en manuel prøve i SQL editor på en TESTVIRKSOMHED med tre aktive:
--     insert into public.milestones (company_id, user_id, title, status) values ('<test>', '<medlem>', 'Prøve', 'active');
--   → forventet fejl: «milestones: virksomheden har allerede 3 aktive mål — parkér eller markér et som nået først»
--   FACIT EFTER: sektion 1 har også milestones_hoejst_tre_aktive; sektion 2 og 3 UÆNDREDE (ingen række rørt).
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK:
--   drop trigger if exists milestones_hoejst_tre_aktive on public.milestones;
--   drop function if exists public.haandhaev_hoejst_tre_aktive_maal();

create or replace function public.haandhaev_hoejst_tre_aktive_maal()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  antal integer;
begin
  -- Kun når rækken BLIVER aktiv. Fremdrift, titel, frist på et allerede
  -- aktivt mål passerer uden tælling.
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    select count(*) into antal
      from public.milestones m
     where m.company_id = new.company_id
       and m.status = 'active'
       and m.id is distinct from new.id;
    if antal >= 3 then
      raise exception 'milestones: virksomheden har allerede 3 aktive mål — parkér eller markér et som nået først'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists milestones_hoejst_tre_aktive on public.milestones;
create trigger milestones_hoejst_tre_aktive
  before insert or update on public.milestones
  for each row execute function public.haandhaev_hoejst_tre_aktive_maal();

comment on function public.haandhaev_hoejst_tre_aktive_maal() is
  'Fase 2 (16/9-2026): højst tre aktive mål pr. virksomhed — samme dom som _shared/maal.ts kanOpretteMaal. Rammer kun rækker der bliver aktive; eksisterende overskud gennemgås af rådgiveren.';

select tgname from pg_trigger where tgrelid = 'public.milestones'::regclass and not tgisinternal order by 1;
